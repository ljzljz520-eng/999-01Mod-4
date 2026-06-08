<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DB-CONNECTION, X-DB-HOST, X-DB-PORT, X-DB-NAME, X-DB-USER, X-DB-PASSWORD, X-User-Role, X-Batch-Id, X-City, X-Device-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';

try {
    $facode = isset($_GET['facode']) ? $_GET['facode'] : (isset($_POST['facode']) ? $_POST['facode'] : null);

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }

    $headers = array_change_key_case(getallheaders(), CASE_UPPER);
    $userRole = isset($headers['X-USER-ROLE']) ? $headers['X-USER-ROLE'] : 'user';
    $batchId = isset($headers['X-BATCH-ID']) ? $headers['X-BATCH-ID'] : null;
    $city = isset($headers['X-CITY']) ? urldecode($headers['X-CITY']) : '未知';
    $deviceType = isset($headers['X-DEVICE-TYPE']) ? $headers['X-DEVICE-TYPE'] : 'unknown';
    $isAdmin = ($userRole === 'admin');

    $queryIp = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

    if (!$batchId) {
        $batchId = 'batch_' . md5($queryIp . $userAgent . time() . mt_rand());
    }

    $db = new Database();
    $pdo = $db->connect();

    $stmt = $pdo->prepare("SELECT facode, sn FROM facode2sn WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$result) {
        echo json_encode([
            'success' => true,
            'data' => null
        ]);
        exit;
    }

    $sn = $result['sn'];

    $lockStmt = $pdo->prepare("SELECT is_locked, lock_reason FROM locked_batches WHERE batch_id = :batch_id AND is_locked = 1");
    $lockStmt->execute(['batch_id' => $batchId]);
    $locked = $lockStmt->fetch(PDO::FETCH_ASSOC);

    if ($locked) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => $isAdmin 
                ? '该查询批次已被管理员锁定，原因：' . ($locked['lock_reason'] ?? '序列号冒用风险')
                : '该查询已被限制，请联系管理员'
        ]);
        exit;
    }

    $logStmt = $pdo->prepare("INSERT INTO query_logs (sn, facode, query_ip, city, device_type, user_agent, batch_id) VALUES (:sn, :facode, :query_ip, :city, :device_type, :user_agent, :batch_id)");
    $logStmt->execute([
        'sn' => $sn,
        'facode' => $facode,
        'query_ip' => $queryIp,
        'city' => $city,
        'device_type' => $deviceType,
        'user_agent' => $userAgent,
        'batch_id' => $batchId
    ]);

    $riskData = detectRisk($pdo, $sn, $city, $deviceType, $batchId);

    $response = [
        'success' => true,
        'data' => [
            'facode' => $result['facode'],
            'sn' => $result['sn'],
            'batch_id' => $batchId
        ]
    ];

    if ($riskData['is_risky']) {
        $markerId = ensureRiskMarker($pdo, $sn, $riskData);
        $response['data']['risk'] = [
            'needs_manual_confirm' => true,
            'message' => '该序列号查询存在异常，需要人工确认'
        ];

        if ($isAdmin) {
            $response['data']['risk']['is_admin'] = true;
            $response['data']['risk']['risk_level'] = $riskData['risk_level'];
            $response['data']['risk']['risk_reason'] = $riskData['risk_reason'];
            $response['data']['risk']['triggered_rules'] = $riskData['triggered_rules'];
            $response['data']['risk']['marker_id'] = $markerId;
            $response['data']['risk']['status'] = $riskData['status'];
        }
    }

    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

function detectRisk($pdo, $sn, $currentCity, $currentDevice, $currentBatchId) {
    $triggeredRules = [];
    $riskReason = [];
    $riskLevel = 'low';

    $rulesStmt = $pdo->prepare("SELECT * FROM risk_rules WHERE is_active = 1");
    $rulesStmt->execute();
    $rules = $rulesStmt->fetchAll(PDO::FETCH_ASSOC);

    $rulesByCode = [];
    foreach ($rules as $rule) {
        $rulesByCode[$rule['rule_code']] = $rule;
    }

    $historyStmt = $pdo->prepare("SELECT DISTINCT city, device_type, batch_id, queried_at FROM query_logs WHERE sn = :sn ORDER BY queried_at DESC");
    $historyStmt->execute(['sn' => $sn]);
    $history = $historyStmt->fetchAll(PDO::FETCH_ASSOC);

    if (isset($rulesByCode['city_mismatch'])) {
        $cities = array_column($history, 'city');
        $cities[] = $currentCity;
        $uniqueCities = array_unique(array_filter($cities));
        if (count($uniqueCities) > 1) {
            $triggeredRules[] = 'city_mismatch';
            $citiesList = implode('、', $uniqueCities);
            $riskReason[] = "该序列号在多个城市被查询过（{$citiesList}）";
            $riskLevel = upgradeRiskLevel($riskLevel, 'high');
        }
    }

    if (isset($rulesByCode['device_mismatch'])) {
        $devices = array_column($history, 'device_type');
        $devices[] = $currentDevice;
        $uniqueDevices = array_unique(array_filter($devices));
        if (count($uniqueDevices) > 1) {
            $triggeredRules[] = 'device_mismatch';
            $devicesList = implode('、', $uniqueDevices);
            $riskReason[] = "该序列号在多种设备类型上被查询过（{$devicesList}）";
            $riskLevel = upgradeRiskLevel($riskLevel, 'medium');
        }
    }

    if (isset($rulesByCode['frequency_exceed'])) {
        $config = json_decode($rulesByCode['frequency_exceed']['config_json'], true);
        $timeWindow = $config['time_window_minutes'] ?? 30;
        $maxQueries = $config['max_queries'] ?? 5;

        $freqStmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM query_logs WHERE sn = :sn AND queried_at >= DATE_SUB(NOW(), INTERVAL :minutes MINUTE)");
        $freqStmt->execute(['sn' => $sn, 'minutes' => $timeWindow]);
        $freqResult = $freqStmt->fetch(PDO::FETCH_ASSOC);
        $queryCount = (int)$freqResult['cnt'];

        if ($queryCount >= $maxQueries) {
            $triggeredRules[] = 'frequency_exceed';
            $riskReason[] = "该序列号在{$timeWindow}分钟内被查询了{$queryCount}次，超过阈值{$maxQueries}次";
            $riskLevel = upgradeRiskLevel($riskLevel, 'critical');
        }
    }

    return [
        'is_risky' => count($triggeredRules) > 0,
        'risk_level' => $riskLevel,
        'risk_reason' => implode('；', $riskReason),
        'triggered_rules' => $triggeredRules,
        'status' => 'pending'
    ];
}

function upgradeRiskLevel($current, $new) {
    $levels = ['low' => 1, 'medium' => 2, 'high' => 3, 'critical' => 4];
    return $levels[$new] > $levels[$current] ? $new : $current;
}

function ensureRiskMarker($pdo, $sn, $riskData) {
    $checkStmt = $pdo->prepare("SELECT id, status FROM risk_markers WHERE sn = :sn AND status = 'pending'");
    $checkStmt->execute(['sn' => $sn]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if ($existing) {
        $updateStmt = $pdo->prepare("UPDATE risk_markers SET risk_level = :risk_level, risk_reason = :risk_reason, triggered_rules = :triggered_rules WHERE id = :id");
        $updateStmt->execute([
            'risk_level' => $riskData['risk_level'],
            'risk_reason' => $riskData['risk_reason'],
            'triggered_rules' => json_encode($riskData['triggered_rules']),
            'id' => $existing['id']
        ]);
        return $existing['id'];
    }

    $insertStmt = $pdo->prepare("INSERT INTO risk_markers (sn, risk_level, risk_reason, triggered_rules, status) VALUES (:sn, :risk_level, :risk_reason, :triggered_rules, 'pending')");
    $insertStmt->execute([
        'sn' => $sn,
        'risk_level' => $riskData['risk_level'],
        'risk_reason' => $riskData['risk_reason'],
        'triggered_rules' => json_encode($riskData['triggered_rules'])
    ]);

    return $pdo->lastInsertId();
}

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
    $headers = array_change_key_case(getallheaders(), CASE_UPPER);
    $userRole = isset($headers['X-USER-ROLE']) ? $headers['X-USER-ROLE'] : 'user';

    if ($userRole !== 'admin') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => '权限不足，仅管理员可访问'
        ]);
        exit;
    }

    $db = new Database();
    $pdo = $db->connect();

    $status = isset($_GET['status']) ? $_GET['status'] : 'pending';

    $sql = "SELECT rm.*, 
                   (SELECT COUNT(DISTINCT batch_id) FROM query_logs WHERE sn = rm.sn) as batch_count,
                   (SELECT COUNT(*) FROM query_logs WHERE sn = rm.sn) as query_count,
                   (SELECT MAX(queried_at) FROM query_logs WHERE sn = rm.sn) as last_query_at
            FROM risk_markers rm";
    
    $params = [];
    if ($status !== 'all') {
        $sql .= " WHERE rm.status = :status";
        $params[':status'] = $status;
    }
    
    $sql .= " ORDER BY rm.created_at DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $markers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($markers as &$marker) {
        if (!empty($marker['triggered_rules'])) {
            $marker['triggered_rules'] = json_decode($marker['triggered_rules'], true);
        }
        
        $logStmt = $pdo->prepare("SELECT DISTINCT batch_id, city, device_type, query_ip, queried_at, facode FROM query_logs WHERE sn = :sn ORDER BY queried_at DESC");
        $logStmt->execute([':sn' => $marker['sn']]);
        $marker['query_history'] = $logStmt->fetchAll(PDO::FETCH_ASSOC);

        $batchIds = array_values(array_unique(array_column($marker['query_history'], 'batch_id')));
        $marker['locked_batches'] = [];
        if (!empty($batchIds)) {
            $lockStmt = $pdo->prepare("SELECT batch_id, is_locked, lock_reason, created_at as locked_at FROM locked_batches WHERE batch_id IN (" . implode(',', array_fill(0, count($batchIds), '?')) . ")");
            $lockStmt->execute($batchIds);
            $locks = $lockStmt->fetchAll(PDO::FETCH_ASSOC);
            $marker['locked_batches'] = $locks;
        }
    }

    echo json_encode([
        'success' => true,
        'data' => $markers
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

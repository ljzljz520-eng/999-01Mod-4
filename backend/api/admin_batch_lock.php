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

    $input = json_decode(file_get_contents('php://input'), true);
    $batchId = $input['batch_id'] ?? null;
    $action = $input['action'] ?? null;
    $reason = $input['reason'] ?? '';

    if (!$batchId || !$action) {
        throw new Exception('缺少参数：batch_id 或 action');
    }

    if (!in_array($action, ['lock', 'unlock'])) {
        throw new Exception('无效的操作类型');
    }

    $db = new Database();
    $pdo = $db->connect();

    if ($action === 'lock') {
        $sn = $input['sn'] ?? '';
        $markerId = $input['marker_id'] ?? null;

        $lockCheckStmt = $pdo->prepare("SELECT id FROM locked_batches WHERE batch_id = :batch_id");
        $lockCheckStmt->execute(['batch_id' => $batchId]);
        $existingLock = $lockCheckStmt->fetch(PDO::FETCH_ASSOC);

        if ($existingLock) {
            $updateStmt = $pdo->prepare("UPDATE locked_batches SET is_locked = 1, lock_reason = :reason, unlocked_by = NULL, unlocked_at = NULL WHERE batch_id = :batch_id");
            $updateStmt->execute([
                'reason' => $reason ?: '管理员手动锁定',
                'batch_id' => $batchId
            ]);
        } else {
            if (!$markerId) {
                $tmpStmt = $pdo->prepare("SELECT sn FROM query_logs WHERE batch_id = :batch_id LIMIT 1");
                $tmpStmt->execute(['batch_id' => $batchId]);
                $tmpSn = $tmpStmt->fetchColumn();
                $sn = $tmpSn ?: $sn;

                $tmpStmt = $pdo->prepare("SELECT id FROM risk_markers WHERE sn = :sn AND status = 'pending' LIMIT 1");
                $tmpStmt->execute(['sn' => $sn]);
                $markerId = $tmpStmt->fetchColumn();

                if (!$markerId) {
                    $insStmt = $pdo->prepare("INSERT INTO risk_markers (sn, risk_level, risk_reason, status, note) VALUES (:sn, 'medium', '管理员手动锁定批次', 'pending', :note)");
                    $insStmt->execute(['sn' => $sn, 'note' => $reason]);
                    $markerId = $pdo->lastInsertId();
                }
            }

            $lockStmt = $pdo->prepare("INSERT INTO locked_batches (batch_id, sn, risk_marker_id, lock_reason, locked_by) VALUES (:batch_id, :sn, :risk_marker_id, :lock_reason, 'admin')");
            $lockStmt->execute([
                'batch_id' => $batchId,
                'sn' => $sn,
                'risk_marker_id' => $markerId,
                'lock_reason' => $reason ?: '管理员手动锁定'
            ]);
        }

        echo json_encode([
            'success' => true,
            'message' => '批次已锁定'
        ]);
    } else {
        $unlockStmt = $pdo->prepare("UPDATE locked_batches SET is_locked = 0, unlocked_by = 'admin', unlocked_at = NOW() WHERE batch_id = :batch_id");
        $unlockStmt->execute(['batch_id' => $batchId]);

        echo json_encode([
            'success' => true,
            'message' => '批次已解锁'
        ]);
    }

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

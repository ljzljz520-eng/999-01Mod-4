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
    $markerId = $input['marker_id'] ?? null;
    $action = $input['action'] ?? null;
    $note = $input['note'] ?? '';

    if (!$markerId || !$action) {
        throw new Exception('缺少参数：marker_id 或 action');
    }

    $validActions = ['confirmed_fraud', 'confirmed_safe', 'ignored'];
    if (!in_array($action, $validActions)) {
        throw new Exception('无效的操作类型');
    }

    $db = new Database();
    $pdo = $db->connect();

    $checkStmt = $pdo->prepare("SELECT sn FROM risk_markers WHERE id = :id");
    $checkStmt->execute(['id' => $markerId]);
    $marker = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$marker) {
        throw new Exception('风险标记不存在');
    }

    $updateStmt = $pdo->prepare("UPDATE risk_markers SET status = :status, note = :note, marked_by = 'admin', marked_at = NOW() WHERE id = :id");
    $updateStmt->execute([
        'status' => $action,
        'note' => $note,
        'id' => $markerId
    ]);

    $lockBatches = [];
    if ($action === 'confirmed_fraud') {
        $batchStmt = $pdo->prepare("SELECT DISTINCT batch_id FROM query_logs WHERE sn = :sn");
        $batchStmt->execute(['sn' => $marker['sn']]);
        $batches = $batchStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($batches as $batchId) {
            $lockCheckStmt = $pdo->prepare("SELECT id FROM locked_batches WHERE batch_id = :batch_id");
            $lockCheckStmt->execute(['batch_id' => $batchId]);
            $existingLock = $lockCheckStmt->fetch(PDO::FETCH_ASSOC);

            if (!$existingLock) {
                $lockStmt = $pdo->prepare("INSERT INTO locked_batches (batch_id, sn, risk_marker_id, lock_reason, locked_by) VALUES (:batch_id, :sn, :risk_marker_id, :lock_reason, 'admin')");
                $lockStmt->execute([
                    'batch_id' => $batchId,
                    'sn' => $marker['sn'],
                    'risk_marker_id' => $markerId,
                    'lock_reason' => '管理员确认序列号冒用' . ($note ? "：{$note}" : '')
                ]);
            }
            $lockBatches[] = $batchId;
        }
    }

    echo json_encode([
        'success' => true,
        'message' => '操作成功',
        'data' => [
            'marker_id' => $markerId,
            'new_status' => $action,
            'locked_batches' => $lockBatches
        ]
    ]);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

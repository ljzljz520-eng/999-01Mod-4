<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-DB-CONNECTION, X-DB-HOST, X-DB-PORT, X-DB-NAME, X-DB-USER, X-DB-PASSWORD');

// 处理 OPTIONS 请求（预检请求）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/database.php';

try {
    // 检查 facode 参数
    $facode = isset($_GET['facode']) ? $_GET['facode'] : (isset($_POST['facode']) ? $_POST['facode'] : null);

    if (!$facode) {
        throw new Exception('缺少 facode 参数');
    }

    // 连接数据库
    $db = new Database();
    $pdo = $db->connect();

    // 查询数据
    $stmt = $pdo->prepare("SELECT facode, sn FROM facode2sn WHERE facode = :facode");
    $stmt->execute(['facode' => $facode]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    // 返回结果
    echo json_encode([
        'success' => true,
        'data' => $result ?: null
    ]);

} catch (Exception $e) {
    http_response_code(400); // Bad Request
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

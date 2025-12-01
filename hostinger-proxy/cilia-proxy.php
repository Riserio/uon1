<?php
/**
 * PROXY CILIA - Hostinger
 * 
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Faça upload deste arquivo para seu Hostinger (ex: public_html/cilia-proxy.php)
 * 2. Anote o IP fixo do seu servidor Hostinger
 * 3. Solicite à CILIA para whitelist deste IP
 * 4. Configure a URL do proxy nas integrações (ex: https://seudominio.com/cilia-proxy.php)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, authToken');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Validate request
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get POST data
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data || !isset($data['cilia_url']) || !isset($data['auth_token']) || !isset($data['payload'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields: cilia_url, auth_token, payload']);
    exit;
}

$ciliaUrl = $data['cilia_url'];
$authToken = $data['auth_token'];
$payload = $data['payload'];

// Log para debug (opcional - remova em produção)
error_log("CILIA Proxy: Chamando $ciliaUrl");

// Make request to CILIA
$ch = curl_init($ciliaUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'authToken: ' . $authToken,
    'Accept: application/json'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(500);
    echo json_encode([
        'error' => 'CURL error: ' . $curlError,
        'cilia_url' => $ciliaUrl
    ]);
    exit;
}

// Return CILIA response
http_response_code($httpCode);
echo $response;
?>

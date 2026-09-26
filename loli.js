/*
Loli Labs Token 捕获
仅从：
GET /api/v1/mails/unread-count
获取 Authorization: Bearer xxx

不会调用登录接口
*/

const url = $request.url || "";
const method = $request.method || "";
const headers = $request.headers || {};

const target = "https://labs-api.loli.host/api/v1/mails/unread-count";

if (method === "GET" && url === target) {

    let authorization =
        headers["Authorization"] ||
        headers["authorization"] ||
        "";

    if (authorization && /^Bearer\s+/i.test(authorization)) {

        const token = authorization.replace(/^Bearer\s+/i, "").trim();

        if (token) {
            $persistentStore.write(token, "loli_access_token");

            console.log(
                "[Loli] Token 捕获成功：" +
                token.substring(0, 20) +
                "..."
            );
        }
    }
}

$done();

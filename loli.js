const TOKEN_KEY = "loli_access_token";

const TOKEN_PATH =
    "/api/v1/mails/unread-count";

const SIGNIN_URL =
    "https://labs-api.loli.host/api/v1/signin";


/*
 * =====================================================
 * 1. 捕获 Token
 * =====================================================
 */

if ($script.type === "http-request") {

    const url = $request.url || "";
    const method = $request.method || "";

    console.log("[Loli] Token 捕获脚本触发");
    console.log("[Loli] " + method + " " + url);

    if (
        method === "GET" &&
        url.indexOf(
            "https://labs-api.loli.host" + TOKEN_PATH
        ) === 0
    ) {

        const headers = $request.headers || {};

        let authorization = "";

        for (const key in headers) {

            if (
                key.toLowerCase() === "authorization"
            ) {
                authorization = headers[key];
                break;
            }
        }

        if (
            authorization &&
            /^Bearer\s+/i.test(authorization)
        ) {

            const token =
                authorization
                    .replace(/^Bearer\s+/i, "")
                    .trim();

            if (token) {

                const saved =
                    $persistentStore.write(
                        token,
                        TOKEN_KEY
                    );

                console.log(
                    "[Loli] Token 获取成功"
                );

                console.log(
                    "[Loli] Token 保存结果: " +
                    saved
                );

            } else {

                console.log(
                    "[Loli] Authorization 为空"
                );
            }

        } else {

            console.log(
                "[Loli] 没有发现 Bearer Authorization"
            );
        }
    }

    $done({});
    return;
}


/*
 * =====================================================
 * 2. 定时签到
 * =====================================================
 */

if ($script.type === "cron") {

    const token =
        $persistentStore.read(TOKEN_KEY);

    if (!token) {

        console.log(
            "[Loli] 没有保存的 Token"
        );

        $notification.post(
            "Loli Labs",
            "签到失败",
            "没有 Token，请先打开 loli.host"
        );

        $done();
        return;
    }


    console.log(
        "[Loli] 开始签到"
    );


    const headers = {
        "Authorization": "Bearer " + token,
        "Accept": "*/*",
        "Content-Type": "application/json",
        "Origin": "https://loli.host",
        "Referer": "https://loli.host/",
        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) " +
            "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
            "Version/27.0 Mobile/24A437 Safari/604.1"
    };


    $httpClient.post(
        {
            url: SIGNIN_URL,
            headers: headers
        },

        function(error, response, body) {

            if (error) {

                console.log(
                    "[Loli] 签到请求错误: " +
                    error
                );

                $notification.post(
                    "Loli Labs",
                    "签到失败",
                    String(error)
                );

                $done();
                return;
            }


            console.log(
                "[Loli] HTTP " +
                response.status
            );

            console.log(
                "[Loli] Response: " +
                body
            );


            let message = body || "";

            try {

                const json =
                    JSON.parse(body);

                message =
                    json.message ||
                    json.msg ||
                    (
                        json.data &&
                        (
                            json.data.message ||
                            json.data.msg
                        )
                    ) ||
                    body;

            } catch (e) {}


            if (
                response.status >= 200 &&
                response.status < 300
            ) {

                $notification.post(
                    "Loli Labs",
                    "签到完成",
                    String(message)
                );

            } else {

                $notification.post(
                    "Loli Labs",
                    "签到失败",
                    "HTTP " +
                    response.status +
                    "\n" +
                    String(message)
                );
            }

            $done();
        }
    );

    return;
}


/*
 * =====================================================
 * 3. 其他情况
 * =====================================================
 */

$done();

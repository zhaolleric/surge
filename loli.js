/*
 * @name         LOLI Labs 自动签到
 * @description  自动捕获 LOLI Authorization + 自动签到
 * @author       Eric
 * @version      3.0.0
 */

const API = "https://labs-api.loli.host/api/v1";
const KEY = "LOLI_TOKEN";

// =====================================================
// HTTP Request：捕获 LOLI 已登录请求中的 Authorization
// =====================================================

if ($script.type === "http-request") {

    const headers = $request.headers || {};

    const auth =
        headers["Authorization"] ||
        headers["authorization"];

    console.log(
        "LOLI Request:",
        $request.url
    );

    if (auth) {

        console.log(
            "发现 Authorization"
        );

        if (/^Bearer\s+/i.test(auth)) {

            const token =
                auth
                    .replace(/^Bearer\s+/i, "")
                    .trim();

            if (token) {

                $persistentStore.write(
                    token,
                    KEY
                );

                console.log(
                    "LOLI Token 保存成功"
                );

                $notification.post(
                    "LOLI Labs",
                    "Token",
                    "已捕获并保存"
                );
            }
        }
    }

    $done({});
    return;
}


// =====================================================
// Cron
// =====================================================

function request(options) {

    return new Promise((resolve, reject) => {

        $httpClient[
            options.method.toLowerCase()
        ](
            options,
            (error, response, body) => {

                if (error) {
                    reject(error);
                    return;
                }

                let json;

                try {
                    json = JSON.parse(body);
                } catch {
                    json = {};
                }

                resolve({
                    status: response.status,
                    body: json
                });
            }
        );
    });
}


// =====================================================
// 获取 Token
// =====================================================

function getToken() {

    // 模块参数优先
    if (
        typeof $argument !== "undefined" &&
        $argument
    ) {

        const match =
            $argument.match(
                /(?:^|&)Token=([^&]*)/
            );

        if (
            match &&
            match[1]
        ) {

            const token =
                decodeURIComponent(
                    match[1]
                ).trim();

            if (token) {
                return token;
            }
        }
    }

    return $persistentStore.read(KEY);
}


// =====================================================
// 签到
// =====================================================

async function signin() {

    const token = getToken();

    console.log(
        "Token:",
        token ? "存在" : "不存在"
    );

    if (!token) {

        $notification.post(
            "LOLI Labs",
            "签到失败",
            "没有找到 Token"
        );

        $done();
        return;
    }


    try {

        const result =
            await request({

                url:
                    `${API}/signin`,

                method:
                    "POST",

                headers: {

                    "Authorization":
                        `Bearer ${token}`,

                    "Content-Type":
                        "application/json",

                    "Accept":
                        "application/json",

                    "Origin":
                        "https://loli.host",

                    "Referer":
                        "https://loli.host/"
                },

                body:
                    "{}"
            });


        console.log(
            "HTTP:",
            result.status
        );

        console.log(
            "Response:",
            JSON.stringify(
                result.body
            )
        );


        // ==========================================
        // 成功
        // ==========================================

        if (
            result.body &&
            result.body.code === 0
        ) {

            const data =
                result.body.data || {};

            $notification.post(
                "LOLI Labs",
                "签到成功",
                `+${data.primogems ?? 0} 原石，累计 ${data.total_days ?? "?"} 天`
            );

            $done();
            return;
        }


        // ==========================================
        // Token 无效
        // ==========================================

        if (
            result.status === 401 ||
            result.body?.code === 40100
        ) {

            $persistentStore.write(
                "",
                KEY
            );

            $notification.post(
                "LOLI Labs",
                "Token 无效",
                "请重新打开 LOLI Labs 获取 Token"
            );

            $done();
            return;
        }


        // ==========================================
        // 其他
        // ==========================================

        $notification.post(
            "LOLI Labs",
            "签到失败",
            result.body?.message ||
            `HTTP ${result.status}`
        );

    } catch (e) {

        console.log(
            "ERROR:",
            String(e)
        );

        $notification.post(
            "LOLI Labs",
            "请求异常",
            String(e)
        );
    }

    $done();
}

signin();

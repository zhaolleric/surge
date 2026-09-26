/*
 * LOLI Labs 自动签到
 * 自动捕获 Authorization Token
 * 自动每日签到
 */

const HOST = "labs-api.loli.host";
const TOKEN_KEY = "LOLI_ACCESS_TOKEN";

function notify(title, content) {
    $notification.post("LOLI Labs", title, content);
}

function getToken() {
    return $persistentStore.read(TOKEN_KEY);
}

function saveToken(token) {
    if (token && token.length > 20) {
        $persistentStore.write(token, TOKEN_KEY);
        return true;
    }
    return false;
}

/*
 * =====================================================
 * HTTP REQUEST
 * 自动捕获 LOLI 请求中的 Authorization
 * =====================================================
 */
if ($script.type === "http-request") {

    const host = ($request.url || "").match(
        /^https?:\/\/([^\/]+)/i
    );

    if (
        host &&
        host[1] === HOST
    ) {

        const headers = $request.headers || {};

        let authorization =
            headers["Authorization"] ||
            headers["authorization"];

        if (authorization) {

            const match = authorization.match(
                /^Bearer\s+(.+)$/i
            );

            if (match) {
                const token = match[1].trim();

                if (saveToken(token)) {
                    console.log(
                        "[LOLI] Token captured"
                    );
                }
            }
        }
    }

    $done();
    return;
}


/*
 * =====================================================
 * CRON
 * 每天自动签到
 * =====================================================
 */

if ($script.type === "cron") {

    const token = getToken();

    if (!token) {

        notify(
            "Token 未获取",
            "请打开 LOLI 网站并正常访问一次，让 Surge 自动捕获 Token。"
        );

        $done();
        return;
    }


    /*
     * ① 查询签到状态
     */

    const statusOptions = {
        url: "https://" + HOST + "/api/v1/signin/status",
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token,
            "Accept": "*/*",
            "Origin": "https://loli.host",
            "Referer": "https://loli.host/"
        }
    };


    $httpClient.get(
        statusOptions,
        function(error, response, body) {

            if (error) {

                notify(
                    "签到失败",
                    "无法连接 LOLI API\n" + error
                );

                $done();
                return;
            }


            let result;

            try {
                result = JSON.parse(body);
            } catch (e) {

                notify(
                    "签到失败",
                    "API 返回数据无法解析"
                );

                $done();
                return;
            }


            /*
             * Token 失效
             */

            if (
                response.status === 401 ||
                response.status === 403
            ) {

                $persistentStore.write(
                    null,
                    TOKEN_KEY
                );

                notify(
                    "Token 已失效",
                    "请重新打开 LOLI 网站，让 Surge 自动获取新的 Token。"
                );

                $done();
                return;
            }


            const data = result.data || {};


            /*
             * ② 今天已经签到
             */

            if (data.signed_today === true) {

                notify(
                    "今日已签到",
                    "日期：" + (data.date || "-") +
                    "\n今日奖励：" + (data.reward ?? "-") +
                    "\n累计签到：" + (data.total_days ?? "-") + " 天"
                );

                $done();
                return;
            }


            /*
             * ③ 未签到
             * POST /api/v1/signin
             * Body 为空
             */

            const signinOptions = {
                url: "https://" + HOST + "/api/v1/signin",
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Accept": "*/*",
                    "Origin": "https://loli.host",
                    "Referer": "https://loli.host/",
                    "Content-Length": "0"
                }
            };


            $httpClient.post(
                signinOptions,
                function(error, response, body) {

                    if (error) {

                        notify(
                            "签到失败",
                            String(error)
                        );

                        $done();
                        return;
                    }


                    let result;

                    try {
                        result = JSON.parse(body);
                    } catch (e) {

                        notify(
                            "签到失败",
                            "返回数据解析失败"
                        );

                        $done();
                        return;
                    }


                    /*
                     * 签到成功
                     */

                    if (
                        result.code === 0 &&
                        result.message === "signed in successfully"
                    ) {

                        const d = result.data || {};

                        notify(
                            "签到成功",
                            "日期：" + (d.date || "-") +
                            "\n原石：" + (d.primogems ?? "-") +
                            "\n累计签到：" + (d.total_days ?? "-") + " 天"
                        );

                        $done();
                        return;
                    }


                    /*
                     * Token 无效
                     */

                    if (
                        response.status === 401 ||
                        response.status === 403 ||
                        /token|authentication|unauthorized|invalid|expired/i
                            .test(result.message || "")
                    ) {

                        $persistentStore.write(
                            null,
                            TOKEN_KEY
                        );

                        notify(
                            "Token 已失效",
                            "请重新打开 LOLI 网站获取新的 Token。"
                        );

                        $done();
                        return;
                    }


                    /*
                     * 其他错误
                     */

                    notify(
                        "签到失败",
                        result.message ||
                        ("HTTP " + response.status)
                    );

                    $done();
                }
            );
        }
    );

    return;
}


$done();

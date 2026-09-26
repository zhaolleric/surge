const HOST = "labs-api.loli.host";
const TOKEN_KEY = "LOLI_ACCESS_TOKEN";

function notify(title, content) {
    $notification.post("LOLI Labs", title, content);
}


/*
 * =========================
 * HTTP REQUEST
 * 自动抓 Authorization
 * =========================
 */

if ($script.type === "http-request") {

    const url = $request.url || "";

    if (!url.includes(HOST + "/api/v1/")) {
        $done();
        return;
    }

    const headers = $request.headers || {};

    const authorization =
        headers["Authorization"] ||
        headers["authorization"];

    if (!authorization) {
        $done();
        return;
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
        $done();
        return;
    }

    const token = match[1].trim();

    if (token.length < 20) {
        $done();
        return;
    }

    /*
     * 直接保存 Token
     * 不再进行 status 验证
     */

    $persistentStore.write(
        token,
        TOKEN_KEY
    );

    console.log("[LOLI] Token captured");

    $done();
    return;
}


/*
 * =========================
 * CRON 自动签到
 * =========================
 */

if ($script.type === "cron") {

    const token =
        $persistentStore.read(TOKEN_KEY);

    if (!token) {

        notify(
            "签到失败",
            "没有获取到 LOLI Token\n请打开 LOLI 网站后重新刷新一次。"
        );

        $done();
        return;
    }


    /*
     * 直接调用签到接口
     *
     * POST /api/v1/signin
     */

    const options = {

        url:
            "https://" +
            HOST +
            "/api/v1/signin",

        method: "POST",

        headers: {

            "Authorization":
                "Bearer " + token,

            "Content-Type":
                "application/json",

            "Accept":
                "*/*",

            "Origin":
                "https://loli.host",

            "Referer":
                "https://loli.host/"
        },

        /*
         * 保持空 Body
         * 不发送 {}
         */
        body: ""
    };


    $httpClient.post(
        options,
        function(error, response, body) {

            if (error) {

                notify(
                    "签到失败",
                    String(error)
                );

                $done();
                return;
            }


            /*
             * HTTP Token 失效
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
                    "请重新打开 LOLI 网站刷新一次。"
                );

                $done();
                return;
            }


            let result;

            try {

                result =
                    JSON.parse(body);

            } catch (e) {

                notify(
                    "签到返回异常",
                    "HTTP " +
                    response.status +
                    "\n" +
                    body
                );

                $done();
                return;
            }


            /*
             * 签到成功
             */

            if (
                result &&
                result.code === 0
            ) {

                const data =
                    result.data || {};

                notify(
                    "签到成功",
                    "日期：" +
                    (data.date || "-") +
                    "\n原石：" +
                    (data.primogems ?? "-") +
                    "\n累计签到：" +
                    (data.total_days ?? "-") +
                    " 天"
                );

                $done();
                return;
            }


            /*
             * 已签到
             */

            if (
                result &&
                /already|signed/i.test(
                    result.message || ""
                )
            ) {

                notify(
                    "今日已签到",
                    result.message
                );

                $done();
                return;
            }


            /*
             * 其他错误
             */

            notify(
                "签到失败",
                result && result.message
                    ? result.message
                    : body
            );

            $done();
        }
    );

    return;
}


$done();

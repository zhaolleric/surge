/*
 * Loli Labs 自动签到
 *
 * Token：
 * 仅从
 * GET /api/v1/mails/unread-count
 * 的 Authorization: Bearer xxx 中获取
 *
 * 不调用登录接口
 */

const TOKEN_KEY = "loli_access_token";

const URL_SIGNIN =
    "https://labs-api.loli.host/api/v1/signin";

const URL_TOKEN =
    "https://labs-api.loli.host/api/v1/mails/unread-count";

const url = $request && $request.url
    ? $request.url
    : "";

const method = $request && $request.method
    ? $request.method
    : "";

/*
 * =====================================================
 * 1. HTTP Request 阶段：捕获 Token
 * =====================================================
 */

if ($request && method === "GET" && url === URL_TOKEN) {

    const headers = $request.headers || {};

    const authorization =
        headers["Authorization"] ||
        headers["authorization"] ||
        "";

    if (/^Bearer\s+/i.test(authorization)) {

        const token =
            authorization
                .replace(/^Bearer\s+/i, "")
                .trim();

        if (token) {

            $persistentStore.write(
                token,
                TOKEN_KEY
            );

            console.log(
                "[Loli] Access Token 已更新"
            );
        }
    }

    $done();
    return;
}


/*
 * =====================================================
 * 2. Cron 阶段：执行签到
 * =====================================================
 */

const token =
    $persistentStore.read(TOKEN_KEY);

if (!token) {

    console.log(
        "[Loli] 没有 Token，请先打开 loli.host"
    );

    $notification.post(
        "Loli Labs",
        "自动签到",
        "没有找到 Token，请先打开 loli.host"
    );

    $done();
    return;
}


const request = {
    url: URL_SIGNIN,

    method: "POST",

    headers: {
        "Authorization": "Bearer " + token,
        "Accept": "*/*",
        "Content-Type": "application/json",
        "Origin": "https://loli.host",
        "Referer": "https://loli.host/"
    }
};


$httpClient.post(
    request,
    function(error, response, data) {

        if (error) {

            console.log(
                "[Loli] 签到请求错误：" +
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
            response.status +
            "：" +
            data
        );


        let message = data || "";

        try {

            const json =
                JSON.parse(data);

            message =
                json.message ||
                json.msg ||
                json.data?.message ||
                json.data?.msg ||
                data;

        } catch (_) {}


        if (
            response.status >= 200 &&
            response.status < 300
        ) {

            $notification.post(
                "Loli Labs",
                "签到成功",
                String(message)
            );

        } else {

            $notification.post(
                "Loli Labs",
                "签到失败",
                "HTTP " +
                response.status +
                " " +
                String(message)
            );
        }

        $done();
    }
);

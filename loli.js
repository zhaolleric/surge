/*
 * LOLI Labs 自动签到
 * 自动捕获 Authorization Bearer Token
 * 验证 Token 后保存
 * 每日自动签到
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
    if (!token || token.length < 20) {
        return false;
    }
    return $persistentStore.write(token, TOKEN_KEY);
}
function clearToken() {
    $persistentStore.write(null, TOKEN_KEY);
}
/*
 * =====================================================
 * HTTP REQUEST
 * 捕获 LOLI API 请求中的 Authorization
 * 先验证 Token，验证成功后才保存
 * =====================================================
 */
if ($script.type === "http-request") {
    const url = $request.url || "";
    if (!url.startsWith("https://" + HOST + "/api/v1/")) {
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
     * 不直接保存。
     * 立即使用这个 Token 查询签到状态。
     * API 返回 code=0 才保存。
     */
    const checkOptions = {
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
        checkOptions,
        function(error, response, body) {
            if (error) {
                $done();
                return;
            }
            if (!response || response.status !== 200) {
                $done();
                return;
            }
            let result;
            try {
                result = JSON.parse(body);
            } catch (e) {
                $done();
                return;
            }
            if (
                result &&
                result.code === 0
            ) {
                const oldToken = getToken();
                if (oldToken !== token) {
                    if (saveToken(token)) {
                        console.log(
                            "[LOLI] Valid Token captured"
                        );
                    }
                }
            }
            $done();
        }
    );
    return;
}
/*
 * =====================================================
 * CRON
 * 每日自动签到
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
     * ① 查询今日签到状态
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
            /*
             * Token HTTP 失效
             */
            if (
                response.status === 401 ||
                response.status === 403
            ) {
                clearToken();
                notify(
                    "Token 已失效",
                    "请打开 LOLI 网站重新获取 Token。"
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
             * API 层错误
             */
            if (
                !result ||
                result.code !== 0
            ) {
                const message =
                    result && result.message
                        ? result.message
                        : "API 返回错误";
                if (
                    /token|authentication|unauthorized|invalid|expired/i
                        .test(message)
                ) {
                    clearToken();
                    notify(
                        "Token 已失效",
                        "请打开 LOLI 网站重新获取 Token。"
                    );
                } else {
                    notify(
                        "签到失败",
                        message
                    );
                }
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
                    "日期：" +
                    (data.date || "-") +
                    "\n今日奖励：" +
                    (data.reward ?? "-") +
                    "\n累计签到：" +
                    (data.total_days ?? "-") +
                    " 天"
                );
                $done();
                return;
            }
            /*
             * ③ 执行签到
     *
     * POST /api/v1/signin
     * Body = {}
     */
            const signinOptions = {
                url: "https://" + HOST + "/api/v1/signin",
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                    "Accept": "*/*",
                    "Origin": "https://loli.host",
                    "Referer": "https://loli.host/"
                },
                body: "{}"
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
                    /*
                     * Token HTTP 失效
                     */
                    if (
                        response.status === 401 ||
                        response.status === 403
                    ) {
                        clearToken();
                        notify(
                            "Token 已失效",
                            "请重新打开 LOLI 网站获取 Token。"
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
                     * ④ 签到成功
                     */
                    if (
                        result &&
                        result.code === 0 &&
                        result.message === "signed in successfully"
                    ) {
                        const d = result.data || {};
                        notify(
                            "签到成功",
                            "日期：" +
                            (d.date || "-") +
                            "\n原石：" +
                            (d.primogems ?? "-") +
                            "\n累计签到：" +
                            (d.total_days ?? "-") +
                            " 天"
                        );
                        $done();
                        return;
                    }
                    /*
                     * ⑤ Token 无效
                     */
                    if (
                        result &&
                        /token|authentication|unauthorized|invalid|expired/i
                            .test(result.message || "")
                    ) {
                        clearToken();
                        notify(
                            "Token 已失效",
                            "请重新打开 LOLI 网站获取 Token。"
                        );
                        $done();
                        return;
                    }
                    /*
                     * ⑥ 其他 API 错误
                     */
                    notify(
                        "签到失败",
                        result && result.message
                            ? result.message
                            : "HTTP " + response.status
                    );
                    $done();
                }
            );
        }
    );
    return;
}
$done();

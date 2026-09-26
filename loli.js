const API = "https://labs-api.loli.host/api/v1/signin";

function getAccounts() {
    const args = {};
    const argument = $argument || "";

    argument.split("&").forEach(item => {
        const index = item.indexOf("=");

        if (index === -1) return;

        const key = item.substring(0, index);
        const value = item.substring(index + 1);

        args[key] = value;
    });

    return (args.Accounts || "")
        .split(",")
        .map(x => x.trim())
        .filter(Boolean);
}

function notify(message) {
    $notification.post(
        "LOLI Labs 自动签到",
        "",
        message
    );
}

const accounts = getAccounts();

if (accounts.length === 0) {
    notify("未配置 Token");
    $done();
    return;
}

let results = [];
let completed = 0;

accounts.forEach((token, index) => {

    $httpClient.post({
        url: API,
        headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "Origin": "https://loli.host",
            "Referer": "https://loli.host/"
        }
    }, (error, response, body) => {

        if (error) {
            results[index] =
                `账号${index + 1}：请求失败`;
        } else {

            let result;

            try {
                result = JSON.parse(body);
            } catch (e) {
                result = null;
            }

            if (result && result.code === 0) {

                const data = result.data || {};

                results[index] =
                    `账号${index + 1}：签到成功` +
                    `，+${data.primogems || 0} 原石` +
                    `，累计 ${data.total_days || 0} 天`;

            } else {

                results[index] =
                    `账号${index + 1}：` +
                    (result && result.message
                        ? result.message
                        : `HTTP ${response ? response.status : "未知"}`);
            }
        }

        completed++;

        if (completed === accounts.length) {

            notify(
                results.join("\n")
            );

            $done();
        }
    });
});

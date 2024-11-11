module.exports = {
    validator: {
        commitment: "processed",
        programs: [
            {
                label: "Bubblegum",
                programId: "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY",
                deployPath: ".bin/bubblegum.so"
            },
            {
                label: "Compression",
                programId: "cmprV1LGw39K9P6vzHrZJkxRhqhreZHAkBKMT4BJUzh",
                deployPath: ".bin/spl_account_compression.so"
            },
            {
                label: "Noop",
                programId: "noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmR",
                deployPath: ".bin/spl_noop.so"
            }
        ]
    }
};
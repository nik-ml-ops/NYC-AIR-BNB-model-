const APP_VERSION = "6";

const dom = {};

const ids = [
    "predictionForm",
    "loading",
    "result",
    "emptyState",
    "predictionText",
    "probabilityBars",
    "themeBtn"
];

function getApiUrl(path) {
    // When frontend is served by FastAPI/Render,
    // use the same origin.
    return new URL(path, window.location.origin).toString();
}

function initUI() {
    ids.forEach(id => {
        dom[id] = document.getElementById(id);
    });

    if (!dom.predictionForm) {
        console.error("Prediction form not found.");
        return;
    }

    dom.predictionForm.addEventListener("submit", handleSubmit);

    if (dom.themeBtn) {
        dom.themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark");

            const icon = dom.themeBtn.querySelector("i");

            if (icon) {
                icon.className =
                    document.body.classList.contains("dark")
                        ? "fa-solid fa-sun"
                        : "fa-solid fa-moon";
            }
        });
    }
}

function getValue(id, parser = value => value) {
    const element = document.getElementById(id);

    if (!element) {
        throw new Error(`Missing input: ${id}`);
    }

    const value = element.value.trim();

    if (value === "") {
        throw new Error(`Please enter ${id}`);
    }

    const parsed = parser(value);

    if (typeof parsed === "number" && !Number.isFinite(parsed)) {
        throw new Error(`Invalid value for ${id}`);
    }

    return parsed;
}

function buildPayload() {
    return {
        latitude: getValue("latitude", parseFloat),
        longitude: getValue("longitude", parseFloat),
        price: getValue("price", parseFloat),
        minimum_nights: getValue(
            "minimum_nights",
            value => parseInt(value, 10)
        ),
        number_of_reviews: getValue(
            "number_of_reviews",
            value => parseInt(value, 10)
        ),
        reviews_per_month: getValue(
            "reviews_per_month",
            parseFloat
        ),
        calculated_host_listings_count: getValue(
            "calculated_host_listings_count",
            value => parseInt(value, 10)
        ),
        availability_365: getValue(
            "availability_365",
            value => parseInt(value, 10)
        ),
        neighbourhood_group: getValue(
            "neighbourhood_group",
            String
        ),
        neighbourhood: getValue(
            "neighbourhood",
            String
        )
    };
}

function setError(message) {
    if (dom.loading) {
        dom.loading.classList.add("hidden");
    }

    if (dom.result) {
        dom.result.classList.add("hidden");
    }

    if (dom.emptyState) {
        dom.emptyState.classList.remove("hidden");

        dom.emptyState.innerHTML = `
            <i class="fa-solid fa-circle-exclamation"></i>
            <h3>Prediction Failed</h3>
            <p>${escapeHtml(message)}</p>
        `;
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function handleSubmit(event) {
    event.preventDefault();

    if (dom.emptyState) {
        dom.emptyState.classList.add("hidden");
    }

    if (dom.result) {
        dom.result.classList.add("hidden");
    }

    if (dom.loading) {
        dom.loading.classList.remove("hidden");
    }

    try {
        const payload = buildPayload();

        const apiUrl = getApiUrl("/predict");

        console.log("Sending request:", apiUrl);
        console.log("Payload:", payload);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();

        console.log("Server status:", response.status);
        console.log("Server response:", text);

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                `Server returned invalid JSON: ${text}`
            );
        }

        if (!response.ok) {
            let message = `Server error ${response.status}`;

            if (data.detail) {
                if (typeof data.detail === "string") {
                    message = data.detail;
                } else if (data.detail.message) {
                    message = data.detail.message;
                } else {
                    message = JSON.stringify(data.detail);
                }
            }

            throw new Error(message);
        }

        renderPrediction(data);

    } catch (error) {
        console.error("Prediction error:", error);
        setError(error.message);
    }
}

function renderPrediction(data) {
    if (dom.loading) {
        dom.loading.classList.add("hidden");
    }

    if (!data || !data.predicted_room_type) {
        setError("Invalid response from prediction server.");
        return;
    }

    if (dom.emptyState) {
        dom.emptyState.classList.add("hidden");
    }

    if (dom.result) {
        dom.result.classList.remove("hidden");
    }

    if (dom.predictionText) {
        dom.predictionText.textContent =
            data.predicted_room_type;
    }

    if (!dom.probabilityBars) {
        return;
    }

    dom.probabilityBars.innerHTML = "";

    const probabilities = data.probability || [];

    let classes = data.classes || [
        "Entire home/apt",
        "Private room",
        "Shared room"
    ];

    probabilities.forEach((value, index) => {
        const percent = Math.max(
            0,
            Math.min(100, Number(value) * 100)
        );

        const label =
            classes[index] || `Class ${index + 1}`;

        const item = document.createElement("div");

        item.className = "probability-item";

        item.innerHTML = `
            <div class="label">
                <span>${escapeHtml(label)}</span>
                <span>${percent.toFixed(1)}%</span>
            </div>

            <div class="progress">
                <div
                    class="progress-bar"
                    style="width:${percent}%">
                </div>
            </div>
        `;

        dom.probabilityBars.appendChild(item);
    });
}

async function checkBackend() {
    try {
        const healthUrl = getApiUrl("/health");

        console.log("Checking backend:", healthUrl);

        const response = await fetch(healthUrl, {
            method: "GET",
            cache: "no-store"
        });

        const data = await response.json();

        console.log("Backend health:", data);

        if (!response.ok || data.status !== "ok") {
            throw new Error(
                data.model_error ||
                "Backend is not ready."
            );
        }

        if (data.model_loaded === false) {
            throw new Error(
                data.model_error ||
                "ML model could not be loaded."
            );
        }

    } catch (error) {
        console.error("Backend health check failed:", error);

        if (dom.emptyState) {
            dom.emptyState.classList.remove("hidden");

            dom.emptyState.innerHTML = `
                <i class="fa-solid fa-circle-exclamation"></i>
                <h3>Backend Offline</h3>
                <p>${escapeHtml(error.message)}</p>
            `;
        }
    }
}

window.addEventListener("DOMContentLoaded", () => {
    console.log(`Airbnb Predictor v${APP_VERSION}`);

    initUI();
    checkBackend();
});

document.addEventListener("keydown", event => {
    if (event.key !== "F2") {
        return;
    }

    const values = {
        latitude: "40.7128",
        longitude: "-73.935242",
        price: "150",
        minimum_nights: "2",
        number_of_reviews: "120",
        reviews_per_month: "4.6",
        calculated_host_listings_count: "3",
        availability_365: "180",
        neighbourhood_group: "Brooklyn",
        neighbourhood: "Williamsburg"
    };

    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);

        if (element) {
            element.value = value;
        }
    });

    alert("Sample Airbnb data loaded.");
});
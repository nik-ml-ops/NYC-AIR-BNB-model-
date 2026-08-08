/* ==========================================================
   AIRBNB ROOM TYPE PREDICTOR
   script.js
   ========================================================== */

const API_URL = "http://127.0.0.1:8000/predict";
const HEALTH_URL = "http://127.0.0.1:8000/health";

const dom = {};
const uiIds = [
    "predictionForm",
    "loading",
    "result",
    "emptyState",
    "predictionText",
    "probabilityBars",
    "themeBtn"
];

function initUI() {
    uiIds.forEach((id) => {
        dom[id] = document.getElementById(id);
    });

    if (!dom.predictionForm) {
        console.error("Prediction form not found in HTML.");
        return;
    }

    dom.predictionForm.addEventListener("submit", handleSubmit);

    if (dom.themeBtn) {
        dom.themeBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark");
            const icon = dom.themeBtn.querySelector("i");
            if (icon) {
                icon.className = document.body.classList.contains("dark")
                    ? "fa-solid fa-sun"
                    : "fa-solid fa-moon";
            }
        });
    }
}

function getValue(id, parser = (v) => v) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing input ${id}`);
    }
    return parser(element.value);
}

function buildPayload() {
    return {
        latitude: getValue("latitude", parseFloat),
        longitude: getValue("longitude", parseFloat),
        price: getValue("price", parseFloat),
        minimum_nights: getValue("minimum_nights", (v) => parseInt(v, 10)),
        number_of_reviews: getValue("number_of_reviews", (v) => parseInt(v, 10)),
        reviews_per_month: getValue("reviews_per_month", parseFloat),
        calculated_host_listings_count: getValue("calculated_host_listings_count", (v) => parseInt(v, 10)),
        availability_365: getValue("availability_365", (v) => parseInt(v, 10)),
        neighbourhood_group: getValue("neighbourhood_group", String),
        neighbourhood: getValue("neighbourhood", String)
    };
}

function setError(message) {
    if (dom.loading) dom.loading.classList.add("hidden");
    if (dom.result) dom.result.classList.add("hidden");
    if (dom.emptyState) {
        dom.emptyState.classList.remove("hidden");
        dom.emptyState.innerHTML = `
            <i class="fa-solid fa-circle-exclamation"></i>
            <h3>Prediction Failed</h3>
            <p>${message}</p>
        `;
    }
}

async function handleSubmit(event) {
    event.preventDefault();

    if (dom.emptyState) dom.emptyState.classList.add("hidden");
    if (dom.result) dom.result.classList.add("hidden");
    if (dom.loading) dom.loading.classList.remove("hidden");

    let payload;
    try {
        payload = buildPayload();
    } catch (err) {
        setError("Please fill all fields correctly.");
        console.error(err);
        return;
    }

    try {
        console.log("Sending prediction request to", API_URL, payload);
        const response = await fetch(API_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Server error ${response.status}: ${body}`);
        }

        const data = await response.json();
        renderPrediction(data);
    } catch (err) {
        setError(err.message);
        console.error(err);
    }
}

function renderPrediction(data) {
    if (dom.loading) dom.loading.classList.add("hidden");

    if (!data || !data.predicted_room_type) {
        setError("Invalid response from server.");
        return;
    }

    if (dom.emptyState) dom.emptyState.classList.add("hidden");
    if (dom.result) dom.result.classList.remove("hidden");
    if (dom.predictionText) dom.predictionText.textContent = data.predicted_room_type;

    if (dom.probabilityBars) {
        dom.probabilityBars.innerHTML = "";
        const labels = ["Entire home/apt", "Private room", "Shared room"];
        if (Array.isArray(data.probability)) {
            data.probability.forEach((value, index) => {
                const percent = (value * 100).toFixed(1);
                const label = labels[index] || `Class ${index + 1}`;
                dom.probabilityBars.insertAdjacentHTML("beforeend", `
                    <div class="probability-item">
                        <div class="label">
                            <span>${label}</span>
                            <span>${percent}%</span>
                        </div>
                        <div class="progress">
                            <div class="progress-bar" style="width:${percent}%"></div>
                        </div>
                    </div>
                `);
            });
        } else {
            dom.probabilityBars.innerHTML = `
                <div class="probability-item">
                    <div class="label">
                        <span>No probability data</span>
                    </div>
                </div>
            `;
        }
    }
}

window.addEventListener("load", () => {
    initUI();
    fetch(HEALTH_URL)
        .then((res) => {
            if (!res.ok) {
                throw new Error(`Health check failed: ${res.status} ${res.statusText}`);
            }
            return res.json();
        })
        .then((health) => console.log("API Status:", health.status))
        .catch((err) => {
            console.warn("API health check failed.", err);
            if (dom.emptyState) {
                dom.emptyState.classList.remove("hidden");
                dom.emptyState.innerHTML = `
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <h3>Backend Offline</h3>
                    <p>${err.message}</p>
                `;
            }
        });
});

document.addEventListener("keydown", (e) => {
    if (e.key === "F2") {
        document.getElementById("latitude").value = 40.7128;
        document.getElementById("longitude").value = -73.935242;
        document.getElementById("price").value = 150;
        document.getElementById("minimum_nights").value = 2;
        document.getElementById("number_of_reviews").value = 120;
        document.getElementById("reviews_per_month").value = 4.6;
        document.getElementById("calculated_host_listings_count").value = 3;
        document.getElementById("availability_365").value = 180;
        document.getElementById("neighbourhood_group").value = "Brooklyn";
        document.getElementById("neighbourhood").value = "Williamsburg";
        alert("Sample data loaded.");
    }
});
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn.compose._column_transformer as _column_transformer
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sklearn.impute import SimpleImputer

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "Model_pipeline.pkl"

# Compatibility for the uploaded model, which was serialized with scikit-learn 1.6.1.
if not hasattr(_column_transformer, "_RemainderColsList"):
    class _RemainderColsList(list):
        pass
    _column_transformer._RemainderColsList = _RemainderColsList

_original_simple_imputer_transform = SimpleImputer.transform

def _patched_simple_imputer_transform(self, X):
    if not hasattr(self, "_fill_dtype"):
        self._fill_dtype = getattr(self, "_fit_dtype", None)
        if self._fill_dtype is None and hasattr(self, "statistics_"):
            self._fill_dtype = np.asarray(self.statistics_).dtype
    return _original_simple_imputer_transform(self, X)

SimpleImputer.transform = _patched_simple_imputer_transform

app = FastAPI(title="Airbnb Room Type Predictor")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

COLUMNS = [
    "latitude", "longitude", "price", "minimum_nights", "number_of_reviews",
    "reviews_per_month", "calculated_host_listings_count", "availability_365",
    "neighbourhood_group", "neighbourhood"
]

class Feature(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    price: float = Field(..., gt=0)
    minimum_nights: int = Field(..., ge=1)
    number_of_reviews: int = Field(..., ge=0)
    reviews_per_month: float = Field(..., ge=0)
    calculated_host_listings_count: int = Field(..., ge=1)
    availability_365: int = Field(..., ge=0, le=365)
    neighbourhood_group: str = Field(..., min_length=1)
    neighbourhood: str = Field(..., min_length=1)

model = None
model_load_error = None

try:
    model = joblib.load(MODEL_PATH)
    print(f"Model loaded successfully: {MODEL_PATH}")
except Exception as exc:
    model_load_error = f"{type(exc).__name__}: {exc}"
    print("Model load failed:", model_load_error)

@app.middleware("http")
async def no_cache(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@app.get("/")
def index():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/index.html")
def index_html():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/script.js")
def script_js():
    return FileResponse(BASE_DIR / "script.js", media_type="application/javascript")

@app.get("/contex.css")
def contex_css():
    return FileResponse(BASE_DIR / "contex.css", media_type="text/css")

@app.get("/health")
@app.get("/health/")
def health():
    return {
        "status": "ok" if model is not None else "error",
        "model_loaded": model is not None,
        "model_error": model_load_error,
    }

@app.get("/version")
def version():
    return {"version": "6", "model_loaded": model is not None}

@app.post("/predict")
@app.post("/predict/")
def predict(features: Feature):
    if model is None:
        raise HTTPException(status_code=503, detail={
            "error": "model_unavailable",
            "message": model_load_error or "Model is not loaded."
        })

    data = pd.DataFrame([features.model_dump()], columns=COLUMNS)
    try:
        prediction = model.predict(data)
        probability = model.predict_proba(data)[0].tolist()
    except Exception as exc:
        raise HTTPException(status_code=500, detail={
            "error": "prediction_failed",
            "message": str(exc)
        }) from exc

    classes = getattr(model, "classes_", None)
    if classes is None and hasattr(model, "named_steps"):
        final_estimator = list(model.named_steps.values())[-1]
        classes = getattr(final_estimator, "classes_", None)
    class_names = [str(x) for x in classes] if classes is not None else []

    return {
        "predicted_room_type": str(prediction[0]),
        "probability": probability,
        "classes": class_names,
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)

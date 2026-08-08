import numpy as np
import pandas as pd

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
import joblib
import sklearn.compose._column_transformer as _column_transformer
from sklearn.impute import SimpleImputer
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=".", html=True), name="static")

# Compatibility shim for models saved with older scikit-learn versions
if not hasattr(_column_transformer, '_RemainderColsList'):
    class _RemainderColsList(list):
        pass
    _column_transformer._RemainderColsList = _RemainderColsList

# Compatibility patch for unpickled SimpleImputer objects from scikit-learn 1.6.1
_original_simple_imputer_transform = SimpleImputer.transform

def _patched_simple_imputer_transform(self, X):
    if not hasattr(self, '_fill_dtype'):
        self._fill_dtype = getattr(self, '_fit_dtype', None)
        if self._fill_dtype is None and hasattr(self, 'statistics_'):
            self._fill_dtype = np.asarray(self.statistics_).dtype
    return _original_simple_imputer_transform(self, X)

SimpleImputer.transform = _patched_simple_imputer_transform

COLUMNS = ['latitude', 'longitude', 'price', 'minimum_nights', 'number_of_reviews',
            'reviews_per_month', 'calculated_host_listings_count', 
            'availability_365', 'neighbourhood_group', 'neighbourhood']

model = joblib.load("Model_pipeline.pkl")  # Load the pre-trained model
# pydantic model = the input validation model
class Feature(BaseModel):
    latitude:  float = Field(...,ge=-90 , le=90, description="Latitude of the location")
    longitude: float = Field(...,ge=-180 , le=180, description="Longitude of the location")
    price: float = Field(...,gt=0, description="Price of the property")
    minimum_nights: int = Field(...,gt=1, description="Minimum nights for booking")
    number_of_reviews: int = Field(...,gt=0, description="Number of reviews for the property")
    reviews_per_month: float = Field(...,gt=0, description="Average number of reviews per month")
    calculated_host_listings_count: int = Field(...,gt=0, description="Total number of listings by the host")
    availability_365: int = Field(...,gt=0,le=365, description="Number of days the property is available in a year")
    neighbourhood_group: str = Field(..., description="Neighborhood group of the property")
    neighbourhood: str = Field(...,min_length=1 , description="Neighborhood of the property")

@app.get('/')
def greet():
    return FileResponse('index.html')

@app.get('/health')
def health_check():
    return {"status": "ok"}

@app.get('/script.js')
def script_js():
    return FileResponse('script.js')

@app.get('/contex.css')
def contex_css():
    return FileResponse('contex.css', media_type='text/css')

@app.post("/predict")
def predict(features: Feature):
    data = pd.DataFrame([features.dict()], columns=COLUMNS)  # Convert input features to DataFrame and ensure correct column order
    prediction = model.predict(data)
    probability = model.predict_proba(data)

    return {
        "predicted_room_type": prediction[0],
        "probability": probability[0].tolist()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

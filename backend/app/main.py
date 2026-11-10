from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api.router import api_router
from app.models.db_models import Location, Dataset, MLModel, EnvironmentalRecord
from app.api.endpoints.datasets import load_demo_dataset
from app.schemas.schemas import ModelTrainRequest
from app.api.endpoints.models import train_model

# Initialize SQLite database schema
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Seeds the demo dataset and trains the initial baseline model if database has no records.
    """
    db = SessionLocal()
    try:
        loc_count = db.query(Location).count()
        if loc_count == 0:
            print("[DroughtSense Startup] Initializing demo hydrometeorological dataset...")
            load_demo_dataset(db=db)
            
        # Train default Random Forest model if no models exist and records are available
        existing_models = db.query(MLModel).count()
        rec_count = db.query(EnvironmentalRecord).count()
        if existing_models == 0 and rec_count >= 20:
            print("[DroughtSense Startup] Training initial Random Forest model...")
            try:
                train_model(
                    payload=ModelTrainRequest(
                        algorithm="Random Forest",
                        target_type="drought_severity",
                        test_size=0.2
                    ),
                    db=db
                )
            except Exception as e:
                print(f"[DroughtSense Startup] Initial model train notice: {e}")
    finally:
        db.close()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="A Machine Learning-Based Framework for Drought Prediction and Early Warning Using Hydrological and Meteorological Data.",
    version=settings.PROJECT_VERSION,
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include central API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "project": "DroughtSense API",
        "version": settings.PROJECT_VERSION,
        "docs_url": "/docs",
        "api_v1": settings.API_V1_STR
    }

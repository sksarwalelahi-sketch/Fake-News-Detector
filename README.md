# Fake-News-Detector

## Project Title
Fake_News_Detector

## Team Details
- Team Number: 02
- Team Name: Syntax Squad

## Team Members
- Sk Sarwal Elahi
- Arpita Das
- Subham Kumar Das
- Harekrushna Sahoo
- Masuv Pradhan

## Problem Statement-2
REAL TIME MISINFORMATION FLAGGING (REGIONAL LANGUAGES)

## Key Features
- Real-time fake news detection from user-entered headlines or article snippets.
- Multilingual support for regional language inputs with translation to English before analysis.
- Claim verification using trusted fact-check sources through the Google Fact Check API.
- Live news comparison with recent coverage to strengthen verification accuracy.
- Toggleable verification window (`all-time` or `last 7 days`) for current-rumor checks.
- Entity-aware official-source RAG with external registry (`Backend/data/official_registry.json`).
- Async official retrieval with persistent cache store for faster repeated checks.
- Explainable AI output with result label, reason, similarity score, and source evidence.
- Image verification using OCR to extract and analyze text from uploaded news images.
- Reverse image lookup support to inspect possible image reuse and suspicious context.
- Duplicate image fingerprint detection by comparing uploaded images with saved history.
- Firebase-backed history storage for saving, viewing, deleting, and reviewing past checks.
- Trend dashboard showing recent activity, label distribution, language coverage, and evidence-backed checks.
- Demo presets for multilingual testing and smoother project presentation.

## Tech Stack
- Frontend: React.js
- Backend: Flask
- AI/ML: Sentence Transformers, LangDetect, Scikit-learn, OCR
- Database: Firebase

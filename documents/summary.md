# AI Personal Assistant - Specification & Development Guide

## 1. Project Overview & Requirement Specifications

### 1.1. Project Description

A multi-platform smart personal assistant system deeply integrated with the Google ecosystem (Gmail, Google Calendar). The system automatically processes emails, manages schedules, tracks expenses via email balance updates, and features **Self-Updating Semantic Memory** to deliver fully personalized experiences across multi-session conversations for a single user.

### 1.2. Document summary

- **Backend:** NestJS (Typescript, REST API, Authentication, Background Jobs/Queue).
- **Frontend (Web):** Next.js (Typescript, App Router, Vercel AI SDK).
- **Mobile (Android):** React Native (Typescript).
- **Database (RDBMS):** MySQL + Prisma ORM (User, Chat History, Settings, Raw Emails, Events).
- **Vector Database:** pgvector or Qdrant (Store & retrieve Knowledge Base, Semantic Memory via Embeddings).
- **AI Engine:** Gemini AI API (Rules, Natural Language Processing, Function Calling, Memory Extraction, Context management).
- **Audio Synthesis:** Fish.audio API (One-way Text-to-Speech - TTS).
- **Deployment:** Docker (Host local/VPS DB).

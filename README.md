# Trip Service

A microservice responsible for managing the trip lifecycle in a Ride-Hailing System.

---

## 🚀 Tech Stack

- Node.js
- Express.js
- SQLite
- Axios (for inter-service communication)
- UUID
- Docker

---

## 🧠 Architecture

Follows layered architecture:

Controller → Service → Repository → Database

---

## 📁 Project Structure


src/
├── controllers
├── services
├── repositories
├── routes
├── db
├── middleware
├── utils


---

## 🌐 Base URL

http://localhost:3002/v1/trips

---

## 🗄️ Database

- SQLite database: `trip-service.db`
- Table: `trips`

### Schema:
- id (numeric Trip Service ID stored as text for compatibility with seeded data)
- rider_id
- driver_id
- status
- pickup
- drop_location
- fare
- payment_status
- created_at

---

## 🔄 Trip Lifecycle

REQUESTED → ACCEPTED → ONGOING → COMPLETED / PAYMENT_PENDING

---

## 📡 APIs

### Create Trip
POST /v1/trips

### Get Trip
GET /v1/trips/{id}

### Accept Trip
POST /v1/trips/{id}/accept

### Start Trip
POST /v1/trips/{id}/start

### Complete Trip
POST /v1/trips/{id}/complete

---

## 🔗 Inter-Service Communication

- Calls Driver Service to assign active driver
- Calls Payment Service to process payment

---

## 🧪 Setup

Install dependencies:


npm install


Run service:


npm start


---

## 🐳 Docker

Build and run:


docker build -t trip-service .
docker run -p 3002:3002 trip-service


---

## 🧪 Testing

Use Postman to test APIs.

---

## ❤️ Notes

- Trip data is generated dynamically via APIs
- Follows database-per-service pattern
- Includes validation for correct trip lifecycle

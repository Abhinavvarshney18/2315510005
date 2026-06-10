# Notification System

## Overview

This project implements a notification management system with a backend API and a frontend user interface. The application fetches notifications, prioritizes them based on predefined rules, and displays the most relevant notifications to users.

## Features

* Notification retrieval through REST APIs
* Priority-based notification sorting
* Top 10 Priority Inbox
* Notification filtering by category
* Pagination support
* Responsive user interface
* Logging middleware integration
* Error handling and validation

## Tech Stack

### Frontend

* React
* JavaScript/TypeScript
* Material UI

### Backend

* Node.js
* Express.js
* Axios

## Installation

### Backend

```bash
npm install
npm start
```

### Frontend

```bash
npm install
npm start
```

## API Endpoints

### GET /

Returns backend status.

### POST /notify

Creates a notification request.

### GET /priority-notifications

Returns prioritized notifications sorted by priority and recency.

## Priority Logic

1. Placement Notifications – Highest Priority
2. Result Notifications – Medium Priority
3. Event Notifications – Lowest Priority

If two notifications have the same priority, the most recent notification is shown first.

## Project Structure

* notification_app_fe/ – Frontend application
* notification_app_be/ – Backend application
* logging_middleware/ – Logging service

## Author

Abhinav Varshney
GLA University

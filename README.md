# Cloudnest

Cloudnest is a modern cloud storage and file management platform.

## Project Structure

```text
cloudnest/
│
├── client/
│   ├── src/
│   │   ├── components/       # Shared UI components
│   │   ├── pages/            # Page-level route views
│   │   ├── features/         # Feature-based domains
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API & client services
│   │   ├── stores/           # Global state management
│   │   └── types/            # TypeScript type definitions
│   │
│   └── package.json          # Frontend dependencies & scripts
│
├── server/
│   ├── src/
│   │   ├── modules/          # Domain-driven backend modules
│   │   │   ├── auth/         # Authentication & sessions
│   │   │   ├── users/        # User accounts & management
│   │   │   ├── files/        # File metadata & CRUD
│   │   │   ├── folders/      # Directory structure & hierarchy
│   │   │   ├── uploads/      # Chunked & direct upload handling
│   │   │   ├── downloads/    # Streaming downloads & tokens
│   │   │   ├── shares/       # Public & private link sharing
│   │   │   ├── search/       # Full-text & indexed search
│   │   │   └── admin/        # Administration controls
│   │   │
│   │   ├── middleware/       # Express middlewares (auth, validation, etc.)
│   │   ├── config/           # Environment configuration
│   │   ├── database/         # DB connection & models/migrations
│   │   ├── queues/           # Background job queue definitions
│   │   ├── workers/          # Background workers (e.g. thumbnails, virus scan)
│   │   ├── utils/            # Shared helper functions
│   │   └── app.ts            # Server entrypoint
│   │
│   └── package.json          # Backend dependencies & scripts
│
├── docker/                   # Dockerfiles for services
├── nginx/                    # Reverse proxy & routing config
├── docs/                     # Architecture & API documentation
├── tests/                    # End-to-end and integration tests
├── docker-compose.yml        # Multi-container orchestration
└── README.md                 # Project documentation
```

## Getting Started

### Development

#### Client
```bash
cd client
npm install
npm run dev
```

#### Server
```bash
cd server
npm install
npm run dev
```

### Docker
```bash
docker-compose up --build
```

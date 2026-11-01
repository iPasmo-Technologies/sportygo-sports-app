# Database Integration & Architecture Prompt

> Historical implementation prompt. The project now uses Neon PostgreSQL. For current schema and setup information, see [2_DATABASE_DESIGN.md](./2_DATABASE_DESIGN.md) and [3_NEON_POSTGRESQL_CONFIGURATION_README.md](./3_NEON_POSTGRESQL_CONFIGURATION_README.md). Do not use this prompt as the current deployment guide.

## Role

You are an expert **Database Administrator (DBA)**, **Senior Principal Software Engineer**, **Solution Architect**, **Backend Engineer**, **DevOps Engineer**, and **Security Expert**.

Your responsibility is to analyze the entire application and integrate a production-ready relational database architecture without breaking any existing functionality.

---

# Objective

Perform a complete end-to-end migration of the application from JSON/mock data to a fully normalized **Neon PostgreSQL** relational database while keeping the application compatible with:

- React Frontend
- Express.js Backend
- Node.js
- Render Hosting
- Neon PostgreSQL

The application must remain production-ready, scalable, secure, and maintainable.

---

# Initial Analysis

Before writing any code, perform a complete analysis of the repository.

Analyze:

- Entire project folder structure
- React application
- Express server
- API routes
- Controllers
- Services
- Middleware
- Models
- Utility files
- Environment variables
- Authentication
- Authorization
- JSON mock data
- Static data
- Assets
- Existing business logic
- Existing validations
- API contracts
- State management
- Application workflows
- Error handling
- Logging
- Deployment configuration

Do **not** assume anything.

Understand how every feature currently works.

---

# JSON Data Analysis

Locate every JSON file used as mock data.

Analyze:

- Data structure
- Relationships
- Nested objects
- Arrays
- Duplicate data
- IDs
- Missing IDs
- Foreign key relationships
- Enumerations
- Nullable values
- Data types
- Validation rules
- Lookup tables
- Derived values

Create an optimal relational model.

---

# Database Design

Design a fully normalized PostgreSQL database.

Requirements:

- Third Normal Form (3NF)
- Prefer BCNF where appropriate
- Eliminate duplicate data
- Correct relationships
- Proper indexing
- Proper constraints
- Primary Keys
- Foreign Keys
- Unique Constraints
- Check Constraints
- Composite Keys where needed
- Lookup tables
- Junction tables
- Audit columns
- Versioning where appropriate

Every table should include appropriate metadata such as:

- created_at
- updated_at
- deleted_at (soft delete if applicable)
- created_by
- updated_by

---

# Database Standards

Use PostgreSQL best practices.

Choose proper data types:

- UUID
- TEXT
- VARCHAR
- BOOLEAN
- INTEGER
- BIGINT
- NUMERIC
- JSONB only when justified
- DATE
- TIMESTAMP WITH TIME ZONE

Avoid anti-patterns.

---

# Neon PostgreSQL

Configure the application for Neon PostgreSQL.

Include:

- Connection pooling
- SSL
- Environment variables
- Production configuration
- Local development configuration
- Connection retry
- Health checks
- Proper timeout settings

Never hardcode credentials.

Use `.env`.

---

# ORM / Query Layer

Choose the most suitable ORM or query builder for this project.

Evaluate:

- Prisma
- Drizzle ORM
- Knex
- Raw PostgreSQL

Explain why the chosen solution is the best fit.

Implement:

- Database client
- Models
- Repository layer
- Query layer
- Transactions
- Migrations
- Seed scripts

---

# Data Migration

Create a complete migration strategy.

Convert all existing JSON mock data into SQL data.

Generate:

- Seed scripts
- Import scripts
- Data validation
- Duplicate detection
- Relationship mapping
- Transaction-safe imports

Migration must be repeatable.

Use `npm run db:reset:seed` from `backend/` when you need to truncate seedable tables and repopulate them in one step.

Seeded catalog tables now include `sports` for the Choose Your Sport screen, `sport_events` for the Sport Events screen, and `sport_facilities` for the Sport Facility screen.

---

# Backend Refactoring

Replace every mock JSON read/write operation.

Convert all endpoints to database operations.

Replace:

- File reads
- File writes
- In-memory arrays
- Temporary storage

with proper SQL operations.

Maintain existing API contracts.

Do not introduce breaking changes.

---

# API Validation

Ensure all APIs continue to work.

Review:

- GET
- POST
- PUT
- PATCH
- DELETE

Validate:

- Request payloads
- Response payloads
- Status codes
- Error messages
- Pagination
- Filtering
- Searching
- Sorting

---

# Transactions

Use database transactions where required.

Examples:

- Multi-table inserts
- Updates
- Deletes
- Rollbacks

Prevent partial writes.

---

# Performance

Optimize the database.

Include:

- Index strategy
- Query optimization
- Execution plans
- Avoid N+1 queries
- Batch operations
- Efficient joins
- Pagination
- Lazy loading where appropriate

---

# Security

Implement database security.

Include:

- SQL injection prevention
- Parameterized queries
- Input validation
- Output sanitization
- Principle of least privilege
- Secure environment variables
- Secret management

---

# Authentication

Review existing authentication.

Integrate users with PostgreSQL.

Store:

- Users
- Roles
- Permissions
- Sessions (if applicable)

Passwords must be securely hashed.

---

# Authorization

Review all authorization logic.

Move permission checks into a maintainable structure.

Implement:

- Role-based access control (RBAC)
- Permission mapping
- Database-driven authorization where appropriate

---

# Error Handling

Improve database error handling.

Handle:

- Constraint violations
- Duplicate keys
- Missing records
- Deadlocks
- Timeouts
- Connection failures
- Validation failures

Return meaningful API errors.

---

# Logging

Implement structured logging for:

- Queries (development only)
- Errors
- Slow queries
- Connection issues
- Migration failures

Avoid logging secrets.

---

# Configuration

Update:

- Environment variables
- Database configuration
- Render deployment
- Neon connection
- Build scripts
- Startup scripts

---

# Testing

Update all tests.

Include:

- Unit tests
- Integration tests
- Repository tests
- API tests
- Migration tests
- Seed tests

Mock database only where appropriate.

Use a real PostgreSQL test database when required.

---

# Documentation

Generate comprehensive documentation.

Include:

## Database Architecture

- ER Diagram
- Table descriptions
- Relationships
- Constraints

## Setup Guide

- Local development
- Neon setup
- Environment variables
- Running migrations
- Running seeds
- Starting application

## Deployment Guide

Deploy on Render using Neon PostgreSQL.

Document:

- Environment variables
- Build commands
- Start commands
- Database configuration
- Migration execution
- Rollback strategy

---

# Code Quality

Follow:

- SOLID principles
- DRY
- KISS
- Clean Architecture
- Repository Pattern
- Service Layer Pattern
- Modular architecture

Avoid duplicate code.

---

# Deliverables

Produce all required code changes along with:

1. Database schema
2. ER diagram (Mermaid)
3. Migration files
4. Seed files
5. Repository layer
6. Database configuration
7. Updated backend APIs
8. Updated frontend integration (if required)
9. Environment variable documentation
10. Deployment instructions for Render
11. Neon PostgreSQL setup guide
12. Rollback strategy
13. Performance optimization report
14. Security review
15. Test updates
16. Data migration report
17. Any breaking changes (if unavoidable)
18. Final architecture summary

---

# Constraints

- Do **not** remove existing application features.
- Do **not** break existing APIs unless absolutely necessary.
- Preserve existing business logic.
- Preserve frontend behavior.
- Preserve routing.
- Preserve UI functionality.
- Use production-ready code only.
- Avoid unnecessary dependencies.
- Follow PostgreSQL and Neon best practices.
- Keep the implementation scalable for future growth.

---

# Success Criteria

The project is considered complete only when:

- All JSON mock data has been migrated to Neon PostgreSQL.
- Every feature works exactly as before.
- All CRUD operations use the database.
- Migrations run successfully.
- Seed scripts populate the database correctly.
- Tests pass.
- The application deploys successfully on Render.
- Neon PostgreSQL is fully integrated.
- Performance and security best practices are implemented.
- The codebase is clean, modular, maintainable, and well documented.
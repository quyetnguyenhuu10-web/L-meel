# Batch Patch System - Docker Setup

## Quick Start

### 1. Build Docker Image
```bash
docker build -t batch-patch-system:latest .
```

### 2. Run Container
```bash
# Interactive shell
docker run -it batch-patch-system:latest

# Or with docker-compose (includes Prometheus + Grafana)
docker-compose up -d
```

### 3. Run Tests in Container
```bash
docker run batch-patch-system:latest npm run test:all-phases
```

## Docker Images & Ports

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| App | node:20-alpine | 3000 | Batch patch system |
| Prometheus | prom/prometheus | 9091 | Metrics collection |
| Grafana | grafana/grafana | 3001 | Visualization dashboard |

## Using Docker Compose

Start all services:
```bash
docker-compose up -d
```

Check logs:
```bash
docker-compose logs -f app
```

Stop services:
```bash
docker-compose down
```

## Accessing Services

- **App**: `localhost:3000`
- **Prometheus**: `localhost:9091`
- **Grafana**: `localhost:3001` (default: admin/admin)

## Production Deployment

### Build for production:
```bash
docker build -t batch-patch-system:1.0.0 .
```

### Push to registry:
```bash
docker tag batch-patch-system:latest your-registry/batch-patch-system:latest
docker push your-registry/batch-patch-system:latest
```

### Deploy with Kubernetes:
```bash
kubectl apply -f k8s-deployment.yaml
```

## Image Size Optimization

Multi-stage build keeps image small:
- **Builder stage**: Installs all dependencies
- **Production stage**: Only includes necessary files
- **Alpine Linux**: Minimal base image (~5MB)
- **Final image size**: ~200-300MB

## Health Checks

Container includes health check that validates core modules are loadable:
```bash
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3
```

## Environment Variables

```bash
NODE_ENV=production    # Production mode
LOG_LEVEL=INFO         # Optional: logging level
```

## Volumes

```bash
-v ./src:/app/src:ro              # Source code (read-only)
-v ./data:/app/data               # Persistent data
-v ./prometheus.yml:/etc/prom...  # Config files
```

## Troubleshooting

### Container won't start
```bash
docker logs batch-patch-system
```

### Rebuild without cache
```bash
docker build --no-cache -t batch-patch-system:latest .
```

### Check image
```bash
docker inspect batch-patch-system:latest
```

## Next Steps

1. Customize Dockerfile for your needs
2. Add application-specific environment variables
3. Configure Grafana dashboards for monitoring
4. Set up CI/CD to auto-build and push images
5. Deploy to Kubernetes/Docker Swarm for production

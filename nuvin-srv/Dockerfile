# Build stage
FROM golang:1.22 AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server cmd/server/main.go

# Run stage
FROM alpine:3.18
WORKDIR /root/
COPY --from=build /app/server .
EXPOSE 8080
CMD ["./server"]

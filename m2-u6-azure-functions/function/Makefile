.PHONY: build clean run

build:
	GOOS=linux GOARCH=amd64 go build -o handler handler.go

clean:
	rm -f handler handler.exe

run: build
	func start

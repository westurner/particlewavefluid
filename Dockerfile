# Dockerfile for the main development environment
FROM ubuntu:24.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=22.x
# Use a recent LTS Node.js version
ENV PYTHON_VERSION=3.12
# Or match the version in .python-version if needed

# Install system dependencies
RUN --mount=type=cache,target=/var/lib/apt/lists,id=apt-cache-lists \
    --mount=type=cache,target=/var/cache/apt/archives,id=apt-cache-archives \
    apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    wget \
    llvm \
    libncurses5-dev \
    libncursesw5-dev \
    xz-utils \
    tk-dev \
    libxml2-dev \
    libxmlsec1-dev \
    libffi-dev \
    liblzma-dev \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION | bash - && \
    apt-get install -y nodejs

# Install Python (using pyenv-installer for flexibility, or direct apt-get)
# For simplicity, let's use deadsnakes PPA for a specific Python version
RUN --mount=type=cache,target=/var/lib/apt/lists,id=apt-cache-lists \
    --mount=type=cache,target=/var/cache/apt/archives,id=apt-cache-archives \
    apt-get update && apt-get install -y software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y python$PYTHON_VERSION python$PYTHON_VERSION-dev python$PYTHON_VERSION-venv && \
    rm -rf /var/lib/apt/lists/*

# Set default Python to the installed version
RUN update-alternatives --install /usr/bin/python python /usr/bin/python$PYTHON_VERSION 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python$PYTHON_VERSION 1

# Create a non-root user
ARG USERNAME=appuser
ARG USER_UID=1000
ARG USER_GID=$USER_UID
RUN userdel -r ubuntu || true \
    && groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && apt-get update \
    && apt-get install -y sudo bash-completion ripgrep \
    && echo "$USERNAME ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME \
    && rm -rf /var/lib/apt/lists/*



# Set working directory
WORKDIR /app

# Copy project files
#COPY . /app

# Change ownership of /app to the non-root user
RUN mkdir -p /app && chown -R $USERNAME:$USERNAME /app
COPY --chown=$USERNAME:$USERNAME src/subwaysim2/package.json src/subwaysim2/package-lock.json /app/

# Switch to the non-root user
USER $USERNAME

# Install Python dependencies (assuming pixi or uv is used)
# If pixi is used, it should be installed first, then `pixi install`
# For simplicity, let's assume `uv` is used as per uv.lock
# RUN python -m ensurepip && python -m pip install -U pip uv && \
#     uv sync --locked

# Install Next.js dependencies
WORKDIR /workspaces/src
RUN (set -x; ls -al /app /workspaces/**; cd /app && npm install)

# Expose ports (adjust as needed for your applications)
# For Next.js dev server
EXPOSE 3000
# For Python backend (if any)
EXPOSE 8000

# Default command (can be overridden by devcontainer.json)
CMD ["/bin/bash"]

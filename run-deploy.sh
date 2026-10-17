mkdir -p ~/archflux
git clone https://github.com/mailtoravi437/archflux.git ~/archflux
cd ~/archflux
cp .env.example .env
# EDIT .env: POSTGRES_PASSWORD, DB_APP_PASSWORD, API_TOKEN, JWT_SECRET, APP_COOKIE_SECURE=true
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
docker compose -f compose.yml up -d --build
sleep 60
curl -sf localhost:8080/api/health && echo "API UP" || echo "Not ready"

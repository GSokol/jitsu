#!/usr/bin/env bash
echo "Starting Jitsu. $@"

### Vars
PID_SERVER=0
PID_CONFIGURATOR=0

### Funcs
#generates and returns random sequence of letters and numbers
random(){
  cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1
}
#kills server and configurator with SIGTERM
graceful_exit() {
  echo "graceful_exit"
  kill -SIGTERM "$PID_SERVER" 2>/dev/null
  sleep 5
  kill -SIGTERM "$PID_CONFIGURATOR" 2>/dev/null
  exit 143; # 128 + 15 -- SIGTERM
}
#if at least one of services has exited - do shutdown
check_shutdown(){
  PROCESS_CONFIGURATOR="$(pgrep -f '/home/configurator/app/configurator')"
  PROCESS_SERVER="$(pgrep -f '/home/eventnative/app/eventnative')"
  PROCESS_NGINX="$(pgrep -f 'nginx: master process')"

  # Check if PIDs of internal services exist
  if [ -z "$PROCESS_CONFIGURATOR" ]; then
    echo "Jitsu Configurator has already exited."
    graceful_exit
  fi
  if [ -z "$PROCESS_SERVER" ]; then
    echo "Jitsu Server has already exited."
    graceful_exit
  fi
  if [ -z "$PROCESS_NGINX" ]; then
    echo "Nginx has already exited."
    graceful_exit
  fi
}

### Jitsu CLI has different entrypoint
if [ -n "$1" ] && [ "$1" != "/home/eventnative/entrypoint.sh" ]; then
  echo "Jitsu CLI"
  /home/eventnative/app/eventnative "$@"
  if [ $? != 0 ] ; then
    exit 1
  fi
  exit 0
fi

### Parameters
# Jitsu port
NGINX_PORT_VALUE=$PORT
if [[ -z "$NGINX_PORT_VALUE" ]]; then
  NGINX_PORT_VALUE=8000
fi

# Jitsu Server admin token
if [[ -z "$SERVER_ADMIN_TOKEN" ]]; then
  export SERVER_ADMIN_TOKEN=$(random)
  echo "Generated Jitsu server admin token: $SERVER_ADMIN_TOKEN"
fi

# Jitsu Configurator admin token
if [[ -z "$CONFIGURATOR_ADMIN_TOKEN" ]]; then
  export CONFIGURATOR_ADMIN_TOKEN=$(random)
  echo "Generated Jitsu configurator admin token: $CONFIGURATOR_ADMIN_TOKEN"
fi


# Apply bashrc
source ~/.bashrc

trap graceful_exit SIGQUIT SIGTERM SIGINT SIGHUP

export JITSU_CONFIGURATOR_URL=http://localhost:7000
export JITSU_SERVER_URL=http://localhost:8001
### Start services
# Start Jitsu Configurator process
/home/configurator/app/configurator -cfg=/home/configurator/data/config/configurator.yaml -cr=true -dhid=jitsu &
PID_CONFIGURATOR=$!

sleep 4

# Start Jitsu Server process
/home/eventnative/app/eventnative -cfg=/home/eventnative/data/config/eventnative.yaml -cr=true -dhid=jitsu &
PID_SERVER=$!

sleep 1

# Start Nginx process
sed "s/NGINX_PORT/$NGINX_PORT_VALUE/g" /etc/nginx/nginx.conf > /etc/nginx/nginx_replaced.conf && \
mv /etc/nginx/nginx_replaced.conf /etc/nginx/nginx.conf && \
nginx -g 'daemon off;' &

sleep 1

check_shutdown

echo "=============================================================================="
echo "                           🌪 Jitsu has started!"
echo "             💻 visit http://localhost:$NGINX_PORT_VALUE/configurator"
echo "=============================================================================="

### Shutdown loop
# wait forever and check every 3 seconds shutdown
while sleep 3; do
  check_shutdown
done
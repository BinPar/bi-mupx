# Troubleshoot

## Could not create session key
```
Error response from daemon: invalid header field value "oci runtime error: container_linux.go:247: starting container process caused \"process_linux.go:359: container init caused \\\"could not create session key: disk quota exceeded\\\"\"\n"
Error: failed to start containers: <nombre contenedor>
```

Por pruebas anteriores realizadas puede deberse a dos razones:
 - Que se haya llegado al máximo de "session keys"
```bash
cat /proc/sys/kernel/keys/root_maxkeys
```
 - Que se haya llegado al máximo de "pid's" disponibles:
```bash
cat /proc/sys/kernel/pid_max
```

**En ambos casos se soluciona aumentándolo**

## Problema con el docker de mongo en su versión 3.6 (connection refused)
La versión 3.6 del docker de mongo rechaza todas las conexiones automáticamente.

**Solución:**
Por el momento la opción más rápida es hacer un downgrade a la versión 3.4
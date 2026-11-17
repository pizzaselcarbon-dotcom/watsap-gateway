# WhatsApp por QR para Comidas Rápidas el CARBÓN

Este servicio conecta el WhatsApp del negocio (como WhatsApp Web) con tu bot (`api/bot.js`) y con el POS.
Reemplaza a AutoResponder.ai: el celular ya no tiene que estar prendido ni con la app abierta.

## 1. Subirlo a un servidor (Railway, unos 5 USD/mes)
1. Crea un repositorio nuevo en GitHub, por ejemplo `wa-gateway`, y sube TODOS los archivos de esta carpeta (menos `node_modules`).
2. Entra a https://railway.app → **New Project** → **Deploy from GitHub repo** → elige `wa-gateway`.
3. En el servicio, pestaña **Variables**, agrega:
   - `FIREBASE_SERVICE_ACCOUNT` → el mismo JSON que tienes en Vercel.
   - `BOT_URL` → `https://comd-rap-el-carbon-menu.vercel.app`
   - `BOT_SECRET` → el mismo BOT_SECRET que tienes en Vercel.
   - `GW_KEY` → una clave larga que te inventes (la usarás en el POS). Ej.: 30 letras y números.
   - (opcional) `HANDOFF_MIN` → minutos que el bot se calla cuando alguien del negocio escribe desde el celular (por defecto 15; 0 = nunca se calla).
4. Pestaña **Settings → Networking → Generate Domain**. Anota la dirección (ej. `https://wa-gateway-production.up.railway.app`).
5. Espera a que diga **Active/Deployed**.

### Modo «solo envío» (AutoResponder sigue respondiendo)
Agrega la variable `SEND_ONLY` = `true`. Entonces este servicio **no lee ni responde mensajes**: solo sirve para que el POS envíe
mensajes rápidos y escritos a mano. En este modo no necesitas `BOT_URL` ni `BOT_SECRET`, y NO apagues AutoResponder.
(Para pasar después al modo completo, borra `SEND_ONLY` y apaga AutoResponder.)

## 2. Vincular el WhatsApp
1. Abre `https://TU-DIRECCION/qr?key=TU_GW_KEY` (o desde el POS: Ajustes → Conexión directa de WhatsApp → «Abrir pantalla del QR»).
2. En el celular del negocio: WhatsApp → **Dispositivos vinculados → Vincular un dispositivo** y escanea el código.
3. La página debe decir «✅ WhatsApp conectado».
4. Modo completo: **apaga AutoResponder.ai**; si no, el cliente recibiría dos respuestas. (En modo `SEND_ONLY` déjalo prendido.)

## 3. Conectarlo al POS
POS → Ajustes → **Conexión directa de WhatsApp**: pon la dirección y la clave (`GW_KEY`) y toca «Probar conexión».
Desde ahí, «💬 Mensaje», «Responder» y los mensajes rápidos se envían solos, sin abrir WhatsApp.

## Cosas a saber
- El celular debe abrir WhatsApp al menos una vez cada ~2 semanas, o WhatsApp desvincula los dispositivos.
- Si desvinculas desde el celular, el servicio se reinicia y muestra un QR nuevo.
- Fotos, audios y archivos del cliente se ven en el POS como «[imagen]» etc.; el bot no responde a ellos.
- Si alguien del negocio escribe desde el celular, el bot se calla ese chat durante `HANDOFF_MIN` minutos.
- Es una conexión no oficial de WhatsApp Web: con pocos mensajes al día el riesgo de bloqueo es bajo, pero no es cero.
- La sesión se guarda en Firestore (`wa_auth`), así que sobrevive a reinicios y despliegues.
- Pruebas internas: `npm install && npm test`.

## Modo completo en Railway (el bot responde por el QR)
Variables del servicio: `FIREBASE_SERVICE_ACCOUNT`, `BOT_URL=https://comd-rap-el-carbon-menu.vercel.app`, `BOT_SECRET`, `GW_KEY` (no pongas `SEND_ONLY`).
Después: Settings → Networking → Generate Domain, abre `https://TU-DOMINIO/qr?key=GW_KEY` y escanea.
El bot por QR arranca APAGADO; se enciende/apaga en el POS: Ajustes → Conexión directa → «Que el bot responda por este QR».
Apagado: el QR solo envía lo que escribes en el POS. No dejes AutoResponder y el bot QR encendidos a la vez para el mismo número (respuesta doble).

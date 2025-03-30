// Para documentación interactiva y auto-completado de código en el editor
/** @typedef {import('pear-interface')} */ 

/* global Pear */
import Hyperswarm from 'hyperswarm'   // Módulo para redes P2P y conexión entre pares
import crypto from 'hypercore-crypto' // Funciones criptográficas para generar la clave en la aplicación
import b4a from 'b4a'                 // Módulo para conversiones de buffer a cadena y viceversa
import fs from 'fs/promises'
import path from 'path'
const { teardown, updates } = Pear    // Funciones para limpieza y actualizaciones

const swarm = new Hyperswarm()

// Desanunciar la clave pública antes de salir del proceso
// (Esto no es un requisito, pero ayuda a evitar la contaminación DHT)
teardown(() => swarm.destroy())

// Habilitar la recarga automática para la aplicación
// Esto es opcional pero útil durante la producción

// Agregar al inicio del archivo
let transactionHistory = []
let isNewNode = true

// Cuando hay una nueva conexión, escuchar nuevos mensajes y agregarlos a la UI
swarm.on('connection', async (peer) => {
  const name = b4a.toString(peer.remotePublicKey, 'hex').substr(0, 6)
  
  // Solo enviar historial si somos un nodo existente y tenemos historial
  if (!isNewNode && transactionHistory.length > 0) {
    peer.write(JSON.stringify({
      type: 'history',
      transactions: transactionHistory
    }))
  }

  peer.on('data', message => {
    try {
      const data = JSON.parse(message)
      if (data.type === 'history' && isNewNode) {
        // Solo mostrar historial si somos un nodo nuevo
        data.transactions.forEach(transaction => {
          transactionHistory.push(transaction) // Guardar en nuestro historial local
          onMessageAdded('Historical', JSON.stringify(transaction))
        })
        isNewNode = false
      } else if (!data.type) {
        // Transacción normal
        transactionHistory.push(JSON.parse(message)) // Guardar en historial
        onMessageAdded(name, message)
      }
    } catch (e) {
      onMessageAdded(name, message)
    }
  })
  
  peer.on('error', e => console.log(`Error de conexión: ${e}`))
})

// Cuando hay actualizaciones en el enjambre, actualizar el contador de pares
swarm.on('update', () => {
  document.querySelector('#peers-count').textContent = swarm.connections.size
})

document.querySelector('#create-chat-room').addEventListener('click', createChatRoom)
document.querySelector('#join-form').addEventListener('submit', joinChatRoom)
document.querySelector('#transaction-form').addEventListener('submit', sendTransaction)

async function createChatRoom() {
  isNewNode = false  // El creador de la sala no es un nodo nuevo
  transactionHistory = [] // Inicializar historial vacío
  const topicBuffer = crypto.randomBytes(32)
  joinSwarm(topicBuffer)
}

async function joinChatRoom (e) {
  e.preventDefault()
  const topicStr = document.querySelector('#join-chat-room-topic').value
  const topicBuffer = b4a.from(topicStr, 'hex')
  joinSwarm(topicBuffer)
}

async function joinSwarm (topicBuffer) {
  document.querySelector('#setup').classList.add('hidden')
  document.querySelector('#loading').classList.remove('hidden')

  // Unirse al enjambre con el tema. Establecer tanto cliente como servidor en true significa que esta aplicación puede actuar como ambos.
  const discovery = swarm.join(topicBuffer, { client: true, server: true })
  await discovery.flushed()

  const topic = b4a.toString(topicBuffer, 'hex')
  document.querySelector('#chat-room-topic').innerText = topic
  document.querySelector('#loading').classList.add('hidden')
  document.querySelector('#chat').classList.remove('hidden')
}

async function sendTransaction(e) {
  e.preventDefault()
  
  const transaction = {
    remitente: document.querySelector('#sender').value,
    destinatario: document.querySelector('#recipient').value,
    cantidad: parseFloat(document.querySelector('#amount').value),
    fecha: new Date().toISOString()
  }

  // Agregar al historial en memoria
  transactionHistory.push(transaction)

  // Limpiar el formulario
  document.querySelector('#sender').value = ''
  document.querySelector('#recipient').value = ''
  document.querySelector('#amount').value = ''

  // Mostrar en el chat y enviar a los pares
  onMessageAdded('You', JSON.stringify(transaction))
  const peers = [...swarm.connections]
  for (const peer of peers) peer.write(JSON.stringify(transaction))
}

// agrega un elemento al elemento #messages con el contenido establecido como remitente y mensaje
function onMessageAdded (from, message) {
  const $div = document.createElement('div')
  try {
    const transaction = JSON.parse(message)
    $div.textContent = `[${transaction.fecha}] ${from}: ${transaction.remitente} → ${transaction.destinatario}: ${transaction.cantidad}`
  } catch (e) {
    $div.textContent = `<${from}> ${message}`
  }
  document.querySelector('#messages').appendChild($div)
}
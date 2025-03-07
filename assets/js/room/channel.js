import { Socket, Presence } from 'phoenix';
import { initMediaButtonsListeners } from './interactionListeners'
import { getMediaStatus } from './media'
import { addPeerMediaInfo, updatePeersInfo }  from './peerConnection'

let socket = null;
let channel = null;
let mediaTogglers = null;

const handleJoinError = (error) => {
  const errorText = error === 'peer_limit_reached' ?
    'Unable to join: Peer limit reached. Try again later' :
    'Unable to join the room';

  alert(errorText);
}

const getRoomId = () => {
  return window.location.pathname.split('/').filter(Boolean).pop()
}

const getClientId = () => {
  return document.getElementById("room").dataset.clientId
}

const leaveChannel = () => {
  if (channel) {
    channel.leave()
    channel = null
  }

  if (mediaTogglers) {
    mediaTogglers()
    mediaTogglers = null
  }
}

export const joinChannel = async ({ peerConnection }) => {
  leaveChannel()

  if (!socket) {
    socket = new Socket('/socket');
    socket.connect();
  }

  channel = socket.channel(`room:${getRoomId()}`, {
    client_id: getClientId(),
    ...getMediaStatus()
  });

  mediaTogglers = initMediaButtonsListeners(peerConnection, channel)

  const presence = new Presence(channel);
  presence.onSync(() => {
    console.log("Peer count: ", presence.list().length)
    if (1 < presence.list().length) {
      document.getElementById("waiting-for-peers").classList.add('hidden')
      updatePeersInfo(presence.state)
    } else {
      document.getElementById("waiting-for-peers").classList.remove('hidden')
    }
  });

  channel.on('sdp_offer', async (payload) => {
    try {
      await peerConnection.setRemoteDescription({ type: 'offer', sdp: payload.body });
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      channel.push('sdp_answer', { body: answer.sdp });
    } catch (error) {
      console.error('Error handling SDP offer:', error);
    }
  });

  channel.on('ice_candidate', (payload) => {
    try {
      peerConnection.addIceCandidate(JSON.parse(payload.body));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  });

  channel.on('add_peer_info', (payload) => {
    try {
      addPeerMediaInfo(presence, payload)
    } catch (error) {
      console.error('Error loading peer info:', error);
    }
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      channel.push('ice_candidate', { body: JSON.stringify(event.candidate) });
    }
  };

  return channel.join()
    .receive('ok', () => console.log('Joined channel successfully'))
    .receive('error', handleJoinError);
}

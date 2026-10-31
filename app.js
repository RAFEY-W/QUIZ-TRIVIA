(() => {
  const $ = (selector) => document.querySelector(selector);
  const lobbyView=$('#lobbyView'), gameView=$('#gameView'), nameInput=$('#playerName'), codeInput=$('#roomCode'), lobbyError=$('#lobbyError');
  const buzzer=$('#buzzerButton'), answerArea=$('#answerArea');
  const PLAYER_KEY='quickfire-player-v3';
  const COUNTDOWN_MS=5000, LETTER_MS=115;
  const bank=[
    {category:'RIDDLE',icon:'◇',q:'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?',a:'A map.'},
    {category:'MATH',icon:'＋',q:'A bat and a ball cost $1.10 together. The bat costs one dollar more than the ball. How much does the ball cost?',a:'5 cents.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'Which planet in our solar system has the most moons?',a:'Saturn.'},
    {category:'RIDDLE',icon:'◇',q:'What gets wetter the more it dries?',a:'A towel.'},
    {category:'MATH',icon:'＋',q:'What is the next number in this sequence: 2, 3, 5, 8, 12, …?',a:'17. The gaps grow by one each time.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'What is the only mammal capable of true flight?',a:'A bat.'},
    {category:'RIDDLE',icon:'◇',q:'I speak without a mouth and hear without ears. I have no body, but come alive with the wind. What am I?',a:'An echo.'},
    {category:'MATH',icon:'＋',q:'If you take 3 apples from a pile of 8, how many apples do you have?',a:'3 — the ones you took.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'What is the smallest country in the world by area?',a:'Vatican City.'},
    {category:'RIDDLE',icon:'◇',q:'The more you take, the more you leave behind. What are they?',a:'Footsteps.'},
    {category:'MATH',icon:'＋',q:'A farmer has 17 sheep. All but 9 run away. How many are left?',a:'9 sheep.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'Which ocean is the largest on Earth?',a:'The Pacific Ocean.'},
    {category:'RIDDLE',icon:'◇',q:'What has one eye but cannot see?',a:'A needle.'},
    {category:'MATH',icon:'＋',q:'You have 12 eggs and all but 5 break. How many unbroken eggs remain?',a:'5 eggs.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'What is the chemical symbol for gold?',a:'Au.'},
    {category:'RIDDLE',icon:'◇',q:'What can travel around the world while staying in one corner?',a:'A stamp.'},
    {category:'MATH',icon:'＋',q:'A clock takes 5 seconds to strike 6. How long does it take to strike 12?',a:'11 seconds — there are 11 intervals.'},
    {category:'GENERAL KNOWLEDGE',icon:'✳',q:'How many hearts does an octopus have?',a:'Three.'},
    {category:'RIDDLE',icon:'◇',q:'What has keys but no locks, space but no room, and you can enter but not go inside?',a:'A keyboard.'},
    {category:'MATH',icon:'＋',q:'What is 25% of 80?',a:'20.'}
  ];
  let roomCode='',myId='',isHost=false,room=null,tickTimer=null,toastTimer=null,peer=null,hostConnection=null,hostOffset=0,pendingJoinTimer=null;
  const hostConnections=new Map();
  const now=()=>Date.now()+hostOffset;
  const hostPeerId=code=>`quickfire-${code.toLowerCase()}`;
  const makeId=()=>Math.random().toString(36).slice(2,10);
  const makeCode=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:5},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join('')};
  const showToast=message=>{const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)};
  const shuffleQuestions=()=>{const pool=[...bank];for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}return pool.slice(0,10)};
  const setError=message=>{lobbyError.textContent=message};

  function enterRoom(){
    lobbyView.classList.add('hidden');gameView.classList.remove('hidden');render();
    clearInterval(tickTimer);tickTimer=setInterval(()=>{if(room)renderClock()},80);
  }
  function showLobbyError(message){
    clearTimeout(pendingJoinTimer);pendingJoinTimer=null;setError(message);
    if(peer){peer.destroy();peer=null}hostConnection=null;room=null;myId='';isHost=false;
  }
  function setUpGuestConnection(connection,code,name){
    hostConnection=connection;
    connection.on('open',()=>connection.send({type:'join',name,clientId:makeId()}));
    connection.on('data',message=>{
      if(!message||typeof message!=='object')return;
      if(message.type==='join-rejected'){showLobbyError(message.reason);return}
      if(message.type==='join-accepted'){
        clearTimeout(pendingJoinTimer);pendingJoinTimer=null;myId=message.playerId;sessionStorage.setItem(PLAYER_KEY,myId);room=message.room;roomCode=code;isHost=false;hostOffset=(message.hostNow||Date.now())-Date.now();setError('');enterRoom();
      }else if(message.type==='state'&&message.room){hostOffset=(message.hostNow||Date.now())-Date.now();room=message.room;render()}
      else if(message.type==='room-closed'){leaveRoom(false);showToast('The host closed this room.');setError('That room is no longer available.');}
    });
    connection.on('error',()=>{if(!room)showLobbyError(`No room exists with code ${code}. Check the code and try again.`)});
    connection.on('close',()=>{if(room&&!isHost){leaveRoom(false);showToast('You were disconnected from the room.')}});
  }
  function startHostPeer(){
    if(!window.Peer){showLobbyError('The room service did not load. Check your internet connection and refresh.');return}
    const peerId=hostPeerId(roomCode);peer=new Peer(peerId);
    peer.on('open',()=>{setError('');enterRoom()});
    peer.on('connection',connection=>{
      connection.on('data',message=>{
        if(!message||typeof message!=='object')return;
        if(message.type==='join'){
          const playerName=String(message.name||'').trim();
          if(!playerName){connection.send({type:'join-rejected',reason:'Enter a name before joining this room.'});return}
          if(room.players.some(p=>p.name.trim().toLocaleLowerCase()===playerName.toLocaleLowerCase())){connection.send({type:'join-rejected',reason:'A player with that name already exists in the room. Please change your name.'});return}
          if(room.players.length>=4){connection.send({type:'join-rejected',reason:'This room is full. There are already four players.'});return}
          const player={id:makeId(),name:playerName,score:0};room.players.push(player);connection.playerId=player.id;hostConnections.set(player.id,connection);
          connection.send({type:'join-accepted',playerId:player.id,room,hostNow:Date.now()});broadcastRoom();render();return;
        }
        if(message.type==='action'&&connection.playerId){handleGuestAction(connection.playerId,message.action)}
      });
      connection.on('close',()=>{if(connection.playerId&&room){hostConnections.delete(connection.playerId);room.players=room.players.filter(p=>p.id!==connection.playerId);if(room.buzz?.playerId===connection.playerId){room.buzz=null;room.phase='reveal'}broadcastRoom();render()}});
    });
    peer.on('error',error=>{
      if(error.type==='unavailable-id'){showLobbyError('That room code is already in use. Please create the room again for a fresh code.');return}
      if(!room)showLobbyError('Could not create or connect to the room. Check your internet connection and try again.');
      else showToast('Room connection interrupted.');
    });
  }
  function createRoom(){
    $('#joinForm').classList.add('hidden');$('#showJoinButton').classList.remove('hidden');codeInput.value='';
    const name=nameInput.value.trim();if(!name){setError('Add your name first so everyone knows who buzzed.');nameInput.focus();return}setError('');
    let code=makeCode();
    myId=makeId();isHost=true;sessionStorage.setItem(PLAYER_KEY,myId);
    roomCode=code;room={code,hostId:myId,players:[{id:myId,name,score:0}],questions:shuffleQuestions(),index:0,phase:'waiting',phaseStartedAt:null,buzz:null,answerRevealed:false,createdAt:Date.now()};
    startHostPeer();
  }
  function joinRoom(){
    const name=nameInput.value.trim(),code=codeInput.value.trim().toUpperCase();
    if(!name){setError('Add your name first so everyone knows who buzzed.');nameInput.focus();return}
    if(!code){setError('Enter the code for an existing room.');codeInput.focus();return}
    if(!window.Peer){setError('The room service did not load. Check your internet connection and refresh.');return}
    setError('Connecting to room…');roomCode=code;isHost=false;peer=new Peer();
    peer.on('open',()=>{const connection=peer.connect(hostPeerId(code),{reliable:true});setUpGuestConnection(connection,code,name)});
    peer.on('error',error=>{if(error.type==='peer-unavailable'||error.type==='server-error')showLobbyError(`No room exists with code ${code}. Check the code and try again.`)});
    pendingJoinTimer=setTimeout(()=>{if(!room)showLobbyError(`No room exists with code ${code}, or the host is not connected.`)},9000);
  }
  function sendSnapshot(connection){if(connection.open)connection.send({type:'state',room,hostNow:Date.now()})}
  function broadcastRoom(){for(const connection of hostConnections.values())sendSnapshot(connection)}
  function updateRoom(mutator){if(!isHost){return}if(!room)return;mutator(room);broadcastRoom();render()}
  function handleGuestAction(playerId,action){
    if(!action||!room)return;
    if(action.type==='buzz')captureBuzz(playerId);
    else if(action.type==='leave'){const connection=hostConnections.get(playerId);if(connection)connection.close()}
  }

  function roundClock(value){
    if(value.phase==='countdown')return{phase:'countdown',count:Math.max(1,Math.ceil((COUNTDOWN_MS-(now()-value.phaseStartedAt))/1000)),visible:0};
    if(value.phase==='reveal')return{phase:'reveal',count:0,visible:Math.min(value.questions[value.index].q.length,Math.floor((now()-value.phaseStartedAt)/LETTER_MS))};
    if(value.phase==='buzzed')return{phase:'buzzed',count:0,visible:value.buzz?.visible??0};
    if(value.phase==='judged')return{phase:'judged',count:0,visible:value.questions[value.index].q.length};
    return{phase:'waiting',count:0,visible:0};
  }
  function syncRoundPhase(){
    if(!room||!isHost||room.phase!=='countdown')return;
    if(now()-room.phaseStartedAt>=COUNTDOWN_MS)updateRoom(current=>{if(current.phase==='countdown'){current.phase='reveal';current.phaseStartedAt+=COUNTDOWN_MS}});
  }
  function startRound(){
    if(!isHost||!room||!['waiting','judged'].includes(room.phase))return;
    updateRoom(current=>{current.phase='countdown';current.phaseStartedAt=Date.now();current.buzz=null;current.answerRevealed=false});
  }
  function buzz(){
    if(!room||!['countdown','reveal'].includes(room.phase))return;
    if(!isHost){if(hostConnection?.open)hostConnection.send({type:'action',action:{type:'buzz'}});return}
    captureBuzz(myId);
  }
  function captureBuzz(playerId){
    if(!room||!['countdown','reveal'].includes(room.phase))return;
    syncRoundPhase();if(!room||!['countdown','reveal'].includes(room.phase))return;
    const clock=roundClock(room);
    updateRoom(current=>{if(!['countdown','reveal'].includes(current.phase)||current.buzz)return;current.buzz={playerId,phase:clock.phase,secondsLeft:clock.phase==='countdown'?clock.count:null,visible:clock.visible};current.phase='buzzed';current.phaseStartedAt=Date.now()});
  }
  function render(){renderQuestionStage()}
  function makeQuestionText(question,visible,complete){
    const target=$('#questionText');target.replaceChildren();
    if(complete){target.textContent=question;return}
    for(let i=0;i<question.length;i++){
      const span=document.createElement('span');span.className=i<visible?'revealed-letter':'hidden-letter';span.textContent=question[i]===' '?'\u00a0':question[i];target.append(span);
    }
  }
  function renderClock(){if(!room)return;syncRoundPhase();renderQuestionStage()}
  function renderQuestionStage(){
    if(!room)return;const q=room.questions[room.index];if(!q)return;
    const clock=roundClock(room),winner=room.players.find(p=>p.id===room.buzz?.playerId);
    $('#displayRoomCode').textContent=room.code;$('#roundNumber').textContent=String(Math.floor(room.index/10)+1).padStart(2,'0');
    $('#questionCount').textContent=`QUESTION ${String(room.index+1).padStart(2,'0')} / ${room.questions.length}`;
    $('#categoryTag').textContent=q.category;$('#questionIcon').textContent=q.icon;$('#playerCount').textContent=room.players.length;
    const phaseMessage=$('#phaseMessage');
    if(clock.phase==='waiting'){phaseMessage.textContent=isHost?'Start the round when everyone is ready':'Waiting for the host to start the round';phaseMessage.classList.remove('hidden');makeQuestionText(q.q,0,false)}
    else if(clock.phase==='countdown'){phaseMessage.textContent=`Question begins in ${clock.count}…`;phaseMessage.classList.remove('hidden');makeQuestionText(q.q,0,false)}
    else if(clock.phase==='reveal'){phaseMessage.textContent='';phaseMessage.classList.add('hidden');makeQuestionText(q.q,clock.visible,false)}
    else if(clock.phase==='buzzed'){phaseMessage.textContent='';phaseMessage.classList.add('hidden');makeQuestionText(q.q,room.buzz?.visible??0,false)}
    else {phaseMessage.textContent='Answer judged';phaseMessage.classList.remove('hidden');makeQuestionText(q.q,q.q.length,false)}
    $('#buzzStatus').textContent=winner?`${winner.name.toUpperCase()} GOT THERE FIRST`:clock.phase==='waiting'?'WAITING FOR THE HOST':clock.phase==='countdown'?`BUZZ NOW · QUESTION IN ${clock.count}`:clock.phase==='reveal'?'QUESTION REVEALING · BUZZ ANYTIME':'ANSWER JUDGED';
    $('#buzzCaption').textContent=winner?(winner.id===myId?`Your answer is locked in at ${room.buzz.phase==='countdown'?'the countdown':`${room.buzz.visible} revealed characters`}. Say it out loud.`:`${winner.name} buzzed first. They answer using only what was visible.`):clock.phase==='waiting'?(isHost?'Start the round to begin the 5-second countdown.':'The host will start the 5-second countdown.'):'Buzz now — the question keeps revealing letter by letter.';
    buzzer.disabled=!['countdown','reveal'].includes(clock.phase);buzzer.classList.toggle('buzzed',winner?.id===myId);
    const buzzed=clock.phase==='buzzed',judged=clock.phase==='judged';answerArea.classList.toggle('hidden',!buzzed&&!judged);
    if(buzzed||judged){
      $('#answerLabel').textContent=room.buzz.phase==='countdown'?'BLIND BUZZ · ANSWER NOW':`BUZZED AT ${room.buzz.visible} REVEALED CHARACTERS`;
      $('#answerText').textContent=winner?.id===myId?'Your turn to answer!':`${winner?.name||'A player'} is answering now.`;
      $('#hostAnswerTools').classList.toggle('hidden',!isHost||room.phase!=='buzzed');
      $('#answerKey').textContent=isHost||judged?`Answer key: ${q.a}`:'';
      $('#nextButton').classList.toggle('hidden',!isHost||room.phase!=='judged');
      $('#correctButton').disabled=room.phase==='judged';$('#incorrectButton').disabled=room.phase==='judged';
    }
    $('#startRoundButton').classList.toggle('hidden',!isHost||room.phase!=='waiting');
    $('#startRoundButton').textContent='Start round →';
    $('#hostNote').textContent=isHost?'You’re the host. Start the countdown, then judge the spoken answer.':'The host starts each round. Buzz during the countdown or as the question reveals.';
    const list=$('#playerList');list.replaceChildren();
    room.players.forEach(p=>{const row=document.createElement('div');row.className='player-row'+(p.id===room.buzz?.playerId?' is-first':'');const avatar=document.createElement('div');avatar.className='player-avatar';avatar.textContent=p.name.slice(0,1).toUpperCase();const info=document.createElement('div');info.style.minWidth='0';const pname=document.createElement('div');pname.className='player-name';pname.textContent=p.name;info.append(pname);const tags=document.createElement('div');tags.className='player-tags';if(p.id===room.hostId){const t=document.createElement('span');t.className='player-tag';t.textContent='HOST';tags.append(t)}if(p.id===room.buzz?.playerId){const t=document.createElement('span');t.className='player-tag first-tag';t.textContent='FIRST BUZZ';tags.append(t)}if(tags.childElementCount)info.append(tags);const score=document.createElement('div');score.className='player-score';score.innerHTML=`<strong>${p.score}</strong> pts`;row.append(avatar,info,score);list.append(row)});
    for(let i=room.players.length;i<4;i++){const waiting=document.createElement('div');waiting.className='waiting-row';waiting.innerHTML='<span>+</span> Open seat';list.append(waiting)}
  }
  function judge(correct){if(!isHost||!room||room.phase!=='buzzed')return;updateRoom(current=>{if(correct){const p=current.players.find(player=>player.id===current.buzz?.playerId);if(p)p.score++}current.phase='judged';current.answerRevealed=true});}
  function nextQuestion(){if(!isHost||!room||room.phase!=='judged')return;updateRoom(current=>{current.index++;if(current.index>=current.questions.length){current.questions=shuffleQuestions();current.index=0}current.phase='waiting';current.phaseStartedAt=null;current.buzz=null;current.answerRevealed=false})}
  function leaveRoom(remove=true){
    clearInterval(tickTimer);clearTimeout(pendingJoinTimer);pendingJoinTimer=null;
    const oldPeer=peer,oldHostConnection=hostConnection,wasHost=isHost;
    if(wasHost){for(const connection of hostConnections.values()){try{connection.send({type:'room-closed'});connection.close()}catch{}}}
    else if(remove&&oldHostConnection?.open){try{oldHostConnection.send({type:'action',action:{type:'leave'}})}catch{}}
    peer=null;hostConnection=null;hostConnections.clear();if(oldPeer)oldPeer.destroy();
    room=null;isHost=false;myId='';roomCode='';hostOffset=0;sessionStorage.removeItem(PLAYER_KEY);gameView.classList.add('hidden');lobbyView.classList.remove('hidden');setError('');
  }

  $('#createButton').addEventListener('click',createRoom);$('#joinButton').addEventListener('click',joinRoom);$('#leaveButton').addEventListener('click',()=>leaveRoom(true));
  $('#showJoinButton').addEventListener('click',()=>{$('#joinForm').classList.remove('hidden');$('#showJoinButton').classList.add('hidden');codeInput.focus();setError('')});
  $('#cancelJoinButton').addEventListener('click',()=>{$('#joinForm').classList.add('hidden');$('#showJoinButton').classList.remove('hidden');codeInput.value='';setError('')});
  buzzer.addEventListener('click',buzz);$('#startRoundButton').addEventListener('click',startRound);$('#correctButton').addEventListener('click',()=>judge(true));$('#incorrectButton').addEventListener('click',()=>judge(false));$('#nextButton').addEventListener('click',nextQuestion);
  $('#copyCode').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(roomCode);showToast('Room code copied. Send it to your crew!')}catch{showToast(`Room code: ${roomCode}`)}});
  codeInput.addEventListener('input',()=>{codeInput.value=codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,'')});
  [nameInput,codeInput].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter'){if(el===codeInput)joinRoom();else createRoom()}}));
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!gameView.classList.contains('hidden')&&document.activeElement.tagName!=='BUTTON'){e.preventDefault();buzz()}});
  const dialog=$('#helpDialog');$('#helpButton').addEventListener('click',()=>dialog.showModal());$('#closeHelp').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
  window.addEventListener('beforeunload',()=>{if(isHost){for(const connection of hostConnections.values()){try{connection.send({type:'room-closed'});connection.close()}catch{}}}else if(hostConnection?.open){try{hostConnection.send({type:'action',action:{type:'leave'}})}catch{}}if(peer)peer.destroy()});
})();

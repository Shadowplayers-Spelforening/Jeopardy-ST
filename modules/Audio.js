

export default class Audio{

	context = null;
	activeSound = new Map();

	constructor(){}

	ensureContext(){
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if( !AudioContextClass )
			return null;

		if( !this.context )
			this.context = new AudioContextClass();

		if( this.context.state === 'suspended' )
			this.context.resume();

		return this.context;
	}

	async registerSound( id, url ){

		if( this.activeSound.has(id) )
			return this.activeSound.get(id);

		const sound = new Sound(url, this);
		this.activeSound.set(id, sound);
		await sound.load();
		return sound;

	}

	// Accepts an object with id : url
	async registerSounds( obj ){

		const promises = [];
		for( let id in obj ){
			promises.push(
				this.registerSound(id, obj[id])
			);
		}
		return Promise.all(promises);

	}

	playSound( id, volume = 1.0 ){

		const soundObj = this.activeSound.get(id);
		if( !soundObj )
			throw new Error("Register a sound first via registerSound. Tried to play "+id);

		soundObj.play(volume);
		return soundObj;

	}

	stopSound( id ){

		const soundObj = this.activeSound.get(id);
		if( !soundObj )
			throw new Error("Register a sound first via registerSound. Tried to stop "+id);

		soundObj.stop();

	}


}

class Sound{

	url = '';
	buffer = null;
	source = null;
	gainNode = null;
	context = null;
	parentAudio = null;
	src = null;

	constructor( url, parentAudio = null ){

		this.parentAudio = parentAudio;
		url = String(url);
		if( !url.startsWith('/') )
			url = '/media/audio/'+url+'.ogg';

		this.url = url;
		this.context = parentAudio ? parentAudio.ensureContext() : null;

	}

	async load(){

		if( this.buffer )
			return this.buffer;

		const context = this.parentAudio ? this.parentAudio.ensureContext() : null;
		if( !context )
			return null;

		const response = await fetch(this.url);
		if( !response.ok )
			throw new Error(`Unable to load audio: ${this.url}`);

		const arrayBuffer = await response.arrayBuffer();
		this.buffer = await context.decodeAudioData(arrayBuffer);
		return this.buffer;

	}

	play( volume = 1.0 ){

		const context = this.parentAudio ? this.parentAudio.ensureContext() : null;
		if( !context )
			return false;

		this.stop();

		const source = context.createBufferSource();
		source.buffer = this.buffer;

		const gainNode = context.createGain();
		gainNode.gain.value = Math.max(0, Math.min(1, Number(volume) || 1));

		source.connect(gainNode);
		gainNode.connect(context.destination);

		source.start();
		this.context = context;
		this.source = source;
		this.gainNode = gainNode;

		return this;

	}

	stop(){

		if( this.source ){
			try{
				this.source.stop();
			}catch( error ){
				// Ignore browsers that throw if the source has already ended.
			}
		}

		this.source = null;
		this.gainNode = null;

	}

}

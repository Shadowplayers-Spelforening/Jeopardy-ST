import Autoloader from "./_Autoloader.js";
import Game from "./Game.js";

export default class State extends Autoloader {

	// maps to the include file name. Holds build functions.
	static Prototypes = {
		board : null,
		presentingCategories : null,
		dailyDouble : null,
		dailyDoubleCompleted : null,
		question : null,
		showWager : null,
	};

	static async begin(){

		for( const id in this.Prototypes ){
			this.Prototypes[id] = import('./states/'+id+'.js');
		}

		// Loads everything async
		await Promise.all(Object.values(this.Prototypes));

		for( const id in this.Prototypes ){

			// Clean way to get the value
			const module = await this.Prototypes[id];
			this.Prototypes[id] = module.default;

		}

	}

	// Gets unique state objects for a game
	static getStateObjects( game ){

		const out = {};
		for( const id in this.Prototypes ){

			out[id] = this.Prototypes[id]();
			out[id].setGame(game);

		}
		
		return out;

	}
	
	id = '';
	keybindings = [];
	game = null;
	cdata = {};				// custom saveable data. must be json serializable

	constructor( data ) {
		super(data);
		this.autoLoad(data);
	}

	setGame( game ){
		this.game = game;
	}



	// Overridable. Don't call directly, call via exec
	async onStateEntry(){}
	async onStateExit(){}
	async onRemoteButton( teamColor ){}
	async onRemoteText( teamColor, text ){}


	// built in
	async execStateEntry(){
		return this.onStateEntry();
	}
	async execStateExit(){
		return this.onStateExit();
	}
	async execRemoteButton( teamColor ){
		return this.onRemoteButton(teamColor);
	}

	async execRemoteText( teamColor, text ){
		return this.onRemoteText(teamColor, text);
	}

	getSaveData(){

		let out = {
			cdata : structuredClone(this.cdata)
		};
		return out;

	}

	loadSaveData( data = {} ){
		
		this.autoLoad(data);

	}
	
	async onKeyPress( key ){

		for( let binding of this.keybindings ){

			if( binding.validate(key) && binding.conditionfn.call(this, key) ){
				await binding.fn.call(this, key);
				break;
			}

		}

	}


	addKeyBinding( keys, desc, fn, condfn ){

		if( !Array.isArray(keys) )
			keys = [keys];
		this.keybindings.push(new Keybinding(keys, desc, fn, condfn));

	}

	updateControls(){

		const activeKeybindings = this.keybindings.filter(k => k.conditionfn.call(this));
		const controls = activeKeybindings.map(k => Array.from(k.keys)[0] + ': ' +k.desc);
		Game.ui.setControls(...controls);

	}


};

export class Keybinding{

	keys = new Set();
	desc = '';
	fn = key => {};		// this = State
	conditionfn = () => true;

	constructor( keys, desc, fn, conditionfn ){

		this.keys = new Set(keys);
		this.fn = fn;
		this.desc = desc;
		if( typeof conditionfn === "function" )
			this.conditionfn = conditionfn;

	}

	validate( key ){

		return this.keys.has(key);

	}

}

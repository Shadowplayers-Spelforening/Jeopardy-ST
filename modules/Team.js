import Autoloader from "./_Autoloader.js";
import Constants from "./Constants.js";


export default class Team extends Autoloader{

	color = 0;		// Maps to Constants.BUTTON_COLOR
	score = 0;
	active = false;
	lastText = "";			// answer
	lastNumber = 0;			// bet
	name = "";
	connected = false;
	buzzerEnabled = false;

	constructor( data ){
		super(data);
		this.autoLoad(data);
	}

	reset(){
		this.lastText = "";
		this.lastNumber = 0;
		this.score = 0;
	}

	getName(){
		if( !this.name )
			return this.getColorLabel();
		return this.name;
	}

	getScore(){
		return this.score;
	}

	getColorLabel(){
		return Constants.BUTTON_ENUM[this.color];
	}

	isConnected(){
		return this.active;
	}

	dump(){
		return {
			color : this.color,
			score : this.score,
			active : this.active,
			lastText : this.lastText,
			lastNumber : this.lastNumber,
			name : this.name,
		};
	}

}


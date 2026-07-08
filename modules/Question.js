import Autoloader from "./_Autoloader.js";

export default class Question extends Autoloader{

	static Type = {
		DailyDouble : 'DailyDouble',
		Regular : 'Regular',
		Final : 'Final',
	};

	id = "";
	question = "";
	answer = "";
	
	_value = 0;				// Question value. Cached by game

	constructor( data ){
		super(data);
		this.id = crypto.randomUUID();
		this.autoLoad(data);
	}

	isValid(){
		return this.question.length > 0 && this.answer.length > 0;
	}

	dump(){
		return {
			id : this.id,
			question : this.question,
			answer : this.answer,
		};
	}

};

window.Question = Question;


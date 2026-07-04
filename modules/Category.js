import Autoloader from "./_Autoloader.js";
import Question from "./Question.js";

export default class Category extends Autoloader{

	static MAX_QUESTIONS = 5;

	id = "";
	name = "";
	questions = [];

	constructor( data ){
		super(data);
		this.id = crypto.randomUUID();
		this.autoLoad(data);
	}

	onLoaded(){
		
		this.questions = Question.loadThese(this.questions);
		if( !this.questions.length ){
			for( let i = 0; i < Category.MAX_QUESTIONS; ++i )
				this.questions.push(new Question({}));
		}

	}

	addQuestion( question ){

		if( !(question instanceof Question) )
			throw new Error("Trying to add question of non Question type");

		if( this.questions.length >= Category.MAX_QUESTIONS )
			throw new Error("Too many questions in category");

		this.questions.push(question);

	}

	getQuestionByID(){

		for( let question of this.questions )
			if( question.id === this.id )
				return question;

	}

	recache( boardIndex = 0 ){

		let mul = 1.0 + boardIndex;
		for( let i = 0; i < this.questions.length; ++i )
			this.questions[i]._value = 100 * (i + 1) * mul;

	}

	dump(){
		return {
			id : this.id,
			name : this.name,
			questions : Question.dumpThese(this.questions),
		};
	}

	hasInvalidQuestion(){

		for( let question of this.questions ){
			
			if( !(question instanceof Question) )
				return true;
			if( !question.isValid() )
				return true;

		}
		return false;

	}

};


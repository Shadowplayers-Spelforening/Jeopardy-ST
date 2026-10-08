import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'board', saveable : true,
	});

	out.addKeyBinding(
		'Enter', 'Reveal boards',
		function(){
			this.game.setState("presentingCategories");
			return true;
		},
		function(){ return this.game.getUnpresentedCategories().length; },
	);
	out.addKeyBinding(
		'Enter', 'Final Jeopardy Category',
		function(){
			this.game.setState("presentingFinalQuestion");
		},
		function(){ 
			return (
				!this.game.activeBoardHasUnAnsweredQuestions() && 
				this.game.isOnLastBoard()
			); 
		},
	);
	out.addKeyBinding(
		'Enter', 'Next Board',
		function(){
			this.game.advanceBoard();
			this.updateControls();
			return true;
		},
		function(){ return !this.game.activeBoardHasUnAnsweredQuestions() && !this.game.isOnLastBoard(); },
	);
	

	
	

	out.onStateEntry = async function(){
		
		const game = this.game;
		game.disableAllBuzzers();
		game.setActiveQuestion(false);

	};
	out.onStateExit = async function(){
		const game = this.game;

	};

	return out;

};



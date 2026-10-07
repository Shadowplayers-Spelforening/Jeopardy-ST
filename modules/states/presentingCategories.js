import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'presentingCategories',
	});

	out.addKeyBinding(
		'Enter', 'Continue',
		function(){

			let unpresented = this.game.getUnpresentedCategories();
			this.game.presentedCategories.add(unpresented[0].id);
			unpresented.shift();
			if( !unpresented.length ){
				this.game.setState('board');
			}
			else{
				this.game.setState(this.id);
			}
			return true;

		},
		function(){ return true; },
	);

	out.onStateEntry = async function(){
		const game = this.game;

		const unpresented = game.getUnpresentedCategories();
		if( !unpresented )
			return;

		const question = new Question({
			id : unpresented[0].id,
			question : unpresented[0].name,
		});
		Game.ui.toggleQuestion(question);
		game.draw();

	};
	out.onStateExit = async function(){
		const game = this.game;
		
			
	};

	return out;

};



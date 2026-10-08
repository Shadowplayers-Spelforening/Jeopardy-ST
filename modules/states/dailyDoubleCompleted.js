import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'dailyDoubleCompleted', saveable : true,
		label : 'Daily Double!'
	});

	out.addKeyBinding(
		'Enter', 'Show Wager',
		function(){
			this.game.setState('showWager');
			return true;
		},
		function(){ return true; },
	);

	out.onStateEntry = async function(){
		const game = this.game;

	};
	out.onStateExit = async function(){
		const game = this.game;

	};

	return out;

};



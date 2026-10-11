import Game from "../modules/Game.js";
import State from "../modules/State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'scoreboard',  saveable : true,
		label : 'Final Score',
	});

	out.onStateEntry = async function(){
		
		const game = this.game;
		Game.ui.toggleScoreBoard(true);

	};
	out.onStateExit = async function(){
		const game = this.game;
		Game.ui.toggleScoreBoard(false);
	};

	return out;

};



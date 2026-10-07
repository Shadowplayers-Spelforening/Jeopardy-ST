import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'showWager',
	});

	out.addKeyBinding(
		'Enter', 'Continue',
		function(){
			this.game.setState('board');
			return true;
		},
		function(){ return true; },
	);

	out.onStateEntry = async function(){
		
		const game = this.game;
		const team = game.getCategoryPickingTeam();
		let num = parseInt(team.lastNumber) || 0;
		const question = new Question({
			question : String(num),
		});
		
		// Draw the wager as a question
		Game.ui.toggleQuestion(question);
		Game.ui.toggleQuestionActive(team);
		
		if( !game.lastAnswerCorrect )
			num = -num;
		team.score += num;
		game.onTeamScoreChanged(team);
		game.save();

	};
	out.onStateExit = async function(){
		const game = this.game;

	};

	return out;

};



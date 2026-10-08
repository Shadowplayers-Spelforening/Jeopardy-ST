import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'finalQuestionShowTeamAnswer', saveable : true,
		label : 'Final Question',
	});

	out.addKeyBinding(
		'Enter', 'Correct',
		function(){

			const game = this.game;
			game.lastAnswerCorrect = true;
			game.setState('showWager');
			return true;

		},
		function(){ return true; },
	);
	out.addKeyBinding(
		'Backspace', 'Incorrect',
		function(){

			const game = this.game;
			game.lastAnswerCorrect = false;
			game.setState('showWager');
			return true;

		},
		function(){ return true; },
	);
	
	out.onStateEntry = async function(){
		
		const game = this.game;

		const team = game.getAnsweringTeam();

		const question = new Question({
			question : String(team.lastText),
		});
		
		// Draw the wager as a question
		Game.ui.toggleQuestion(question);
		Game.ui.toggleQuestionActive(team);

		team.lastText = '';		// Need to clear for it to advance to the next team

	};
	out.onStateExit = async function(){
		const game = this.game;
		Game.ui.toggleQuestion(false);
	};

	return out;

};



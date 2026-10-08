import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'finalQuestionShowTeam', saveable : true,
		label : 'Final Question',
	});

	out.addKeyBinding(
		'Enter', 'Show Answer',
		function(){
			this.game.setState('finalQuestionShowTeamAnswer');
			return true;
		},
		function(){ return true; },
	);

	out.onStateEntry = async function(){
		
		const game = this.game;
		// Set answering team to the first team that is active and has an answer
		game.setAnsweringTeam(game.getUnrevealedFinalAnswerTeam());

		const team = game.getAnsweringTeam();
		const question = new Question({
			question : String(team.name),
		});
		
		// Draw the wager as a question
		Game.ui.toggleQuestion(question);
		Game.ui.toggleQuestionActive(team);

	};
	out.onStateExit = async function(){
		const game = this.game;

	};

	return out;

};



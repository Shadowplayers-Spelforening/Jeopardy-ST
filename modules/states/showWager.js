import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'showWager', saveable : true,
	});

	out.addKeyBinding(
		'Enter', 'Continue',
		function(){
			
			const game = this.game;
			if( game.isFinalQuestion() ){
				
				const nextTeam = game.getUnrevealedFinalAnswerTeam();
				if( nextTeam )
					this.game.setState('finalQuestionShowTeam');
				else
					this.game.setState('scoreboard');
				
			}
			else{
				this.game.setState('board');
			}
			
			return true;

		},
		function(){ return true; },
	);

	out.onStateEntry = async function(){
		
		const game = this.game;
		let team = game.getCategoryPickingTeam();
		if( game.isFinalQuestion() )
			team = game.getAnsweringTeam();

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



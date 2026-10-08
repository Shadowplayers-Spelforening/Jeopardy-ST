import Question from "../Question.js";
import State from "../State.js";
import Team from "../Team.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'presentingFinalQuestion', saveable : true,
		label : 'Final Question',
	});

	out.addKeyBinding(
		'Enter', 'Continue',
		function(){

			const game = this.game;
			game.setActiveQuestion(game.finalQuestion, Question.Type.Final);
			game.setState('question');
			
			return true;

		},
		function(){
			return this.hasAllWagers();
		},
	);

	out.hasAllWagers = function(){
		
		const game = this.game;
		return game.teams.every( team => !team.active || team.lastNumber > 0 );

	};

	out.onStateEntry = async function(){
		const game = this.game;

		const question = new Question({
			id : 'finalQuestionCategory',
			question : game.finalQuestionCategory,
		});
		Game.ui.toggleQuestion(question);
		
		for( let team of game.teams ){

			team.lastNumber = 0;
			team.buzzerEnabled = true;
			team.setDisplayMode(Team.Displaymode.Numpad);

		}

		game.setAnsweringTeam(false);
		game.draw();
		game.updateDisplays();

	};


	out.onStateExit = async function(){
		const game = this.game;
		
			
	};


	out.onRemoteText = async function( teamColor, text ){
		
		const game = this.game;
		const team = game.getTeamByColor(teamColor);
		if( !team )
			return;

		const amount = parseInt(text) || 0;

		if( 
			!team.lastNumber &&
			amount > 0 &&
			(amount <= game.minWager || amount <= answeringTeam.score)
		){

			team.buzzerEnabled = false;
			team.lastNumber = amount;
			team.setDisplayMode(Team.Displaymode.Score);
			game.updateDisplay(team);
			game.updateBuzzer(team);
			this.updateControls();

		}

	};

	return out;

};



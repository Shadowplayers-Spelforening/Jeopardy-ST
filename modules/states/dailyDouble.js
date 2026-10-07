import Game from "../Game.js";
import Question from "../Question.js";
import State from "../State.js";
import Team from "../Team.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'dailyDouble',
	});

	out.addKeyBinding(
		'Enter', 'Show Question',
		function(){

			const game = this.game;
			game.setState('question');		// the question itself is already set, so we can just go ahead and switch to question
			return true;

		},
		function(){ 
			const team = this.game.getAnsweringTeam();
			return team && !team.buzzerEnabled;  // buzzerEnabled is set to false when they send in their bet
		},
	);
	

	out.onStateEntry = async function(){
		
		const game = this.game;

		game.disableAllBuzzers();
		const team = game.getAnsweringTeam();
		team.buzzerEnabled = true;
		const question = game.getActiveQuestion();
		Game.ui.toggleQuestion(new Question({
			id : question.id,
			question : "Daily Double!"
		}));
		Game.ui.toggleQuestionActive(team);
		team.setDisplayMode(Team.Displaymode.Numpad);
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
		const answeringTeam = game.getAnsweringTeam();

		if( 
			answeringTeam === team &&
			team.buzzerEnabled &&
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



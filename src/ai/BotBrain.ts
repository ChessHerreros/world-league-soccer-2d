import { Player, Team } from "../entities/Player";
import { Ball } from "../entities/Ball";
import { Arena } from "../world/Arena";
import { Vec2 } from "../math/Vec2";

export interface BotAction {
  moveX: number;
  moveY: number;
  kick: boolean;
  dribbleSide: "left" | "right" | null;
  sprint: boolean;
  dash: boolean;
}

export class BotBrain {
  update(
    dt: number,
    bot: Player,
    allPlayers: Player[],
    ball: Ball,
    arena: Arena,
    botIndex = 0
  ): BotAction {
    const isBlue = bot.team === "blue";

    // Goal targets
    const targetGoalX = isBlue ? arena.width : 0;
    const targetGoalY = arena.height / 2;
    const ownGoalX = isBlue ? 0 : arena.width;
    const ownGoalY = arena.height / 2;

    const botPos = bot.position;
    const ballPos = ball.position;

    // Separate squad & opponents
    const teammates = allPlayers.filter((p) => p.team === bot.team && p !== bot);
    const sameTeamAll = allPlayers.filter((p) => p.team === bot.team);
    const myTeamIndex = sameTeamAll.indexOf(bot);
    const opponents = allPlayers.filter((p) => p.team !== bot.team);

    // Ball distances
    const distToBall = Math.hypot(ballPos.x - botPos.x, ballPos.y - botPos.y);

    // Find nearest player on team to ball
    let closestTeammateToBallDist = 99999;
    let closestTeammateToBall = sameTeamAll[0];
    for (const p of sameTeamAll) {
      const d = Math.hypot(ballPos.x - p.position.x, ballPos.y - p.position.y);
      if (d < closestTeammateToBallDist) {
        closestTeammateToBallDist = d;
        closestTeammateToBall = p;
      }
    }
    const isAmIClosestToBall = closestTeammateToBall === bot;

    // Ball Future Position (0.22s prediction for intercepting)
    const predBallX = Math.max(20, Math.min(arena.width - 20, ballPos.x + ball.velocity.x * 0.22));
    const predBallY = Math.max(20, Math.min(arena.height - 20, ballPos.y + ball.velocity.y * 0.22));

    // Dynamic Role Assignment:
    // Index 0 or closest = Primary Attacker (Chaser)
    // Index 1 = Midfielder / Support
    // Index 2+ = Defender / Goalkeeper
    let targetX: number;
    let targetY: number;

    const isDefendingDanger = isBlue
      ? ballPos.x < arena.width * 0.45
      : ballPos.x > arena.width * 0.55;

    if (isAmIClosestToBall || myTeamIndex === 0) {
      // --- ATTACKER / BALL CHASER LOGIC ---
      // Crucial Haxball AI Math: To push the ball TOWARDS opponent goal, the bot must get BEHIND the ball relative to the goal!
      const goalVectorX = targetGoalX - predBallX;
      const goalVectorY = targetGoalY - predBallY;
      const goalDist = Math.hypot(goalVectorX, goalVectorY);
      const goalDirX = goalDist > 0.0001 ? goalVectorX / goalDist : (isBlue ? 1 : -1);
      const goalDirY = goalDist > 0.0001 ? goalVectorY / goalDist : 0;

      // Position offset: 28px behind ball along goal vector
      const desiredX = predBallX - goalDirX * 28;
      const desiredY = predBallY - goalDirY * 28;

      if (distToBall < 110) {
        // When close to ball, steer directly behind it to kick/push forward
        targetX = desiredX;
        targetY = desiredY;
      } else {
        // Intercept predicted ball position
        targetX = predBallX;
        targetY = predBallY;
      }
    } else if (myTeamIndex === 1 || sameTeamAll.length === 2) {
      // --- MIDFIELDER / SUPPORT LOGIC ---
      if (isDefendingDanger) {
        // Fall back to help defense
        targetX = (ballPos.x + ownGoalX) / 2;
        targetY = (ballPos.y + ownGoalY) / 2;
      } else {
        // Support attack: position on open wing ahead of midfield
        const wingY = (myTeamIndex % 2 === 0) ? arena.height * 0.28 : arena.height * 0.72;
        const forwardX = isBlue ? Math.min(arena.width - 220, ballPos.x + 180) : Math.max(220, ballPos.x - 180);
        targetX = forwardX;
        targetY = wingY;
      }
    } else {
      // --- DEFENDER / GOALKEEPER LOGIC ---
      const keeperX = isBlue ? 130 : arena.width - 130;
      // Clamp keeper Y between goal posts
      const keeperY = Math.max(arena.goalTop + 15, Math.min(arena.goalBottom - 15, ballPos.y));

      if (isDefendingDanger && distToBall < 250) {
        // Charge ball if close in penalty box
        targetX = predBallX;
        targetY = predBallY;
      } else {
        targetX = keeperX;
        targetY = keeperY;
      }
    }

    // --- SHOOTING & KICK LOGIC ---
    let wantKick = false;
    const inKickRange = distToBall <= bot.kickRadius + 6;

    if (inKickRange && bot.canKick()) {
      // Vector from bot to ball
      const dx = ballPos.x - botPos.x;
      const dy = ballPos.y - botPos.y;
      const dLen = Math.hypot(dx, dy);
      const dirX = dLen > 0.0001 ? dx / dLen : (isBlue ? 1 : -1);
      const dirY = dLen > 0.0001 ? dy / dLen : 0;

      // Vector from ball to target goal
      const gDx = targetGoalX - ballPos.x;
      const gDy = targetGoalY - ballPos.y;
      const gLen = Math.hypot(gDx, gDy);
      const gDirX = gLen > 0.0001 ? gDx / gLen : (isBlue ? 1 : -1);
      const gDirY = gLen > 0.0001 ? gDy / gLen : 0;

      // Dot product: check if bot is facing towards opponent goal (dot > -0.2)
      const dotProd = dirX * gDirX + dirY * gDirY;

      const isEmergencyClearance = isBlue ? ballPos.x < 240 : ballPos.x > arena.width - 240;
      const isShotOpportunity = gLen < 480 && dotProd > -0.15;
      const isTeammateNearGoal = teammates.some((t) => {
        const tDistGoal = Math.hypot(targetGoalX - t.position.x, targetGoalY - t.position.y);
        return tDistGoal < gLen - 50;
      });

      if (dotProd > -0.3 || isEmergencyClearance || isShotOpportunity || isTeammateNearGoal) {
        wantKick = true;
      }
    }

    // --- EVASION DRIBBLE LOGIC ---
    let wantDribble: "left" | "right" | null = null;
    const nearestOpponent = opponents.reduce((closest, opp) => {
      const d = Math.hypot(ballPos.x - opp.position.x, ballPos.y - opp.position.y);
      return d < closest.dist ? { player: opp, dist: d } : closest;
    }, { player: opponents[0], dist: 9999 }).player;

    if (nearestOpponent) {
      const oppDist = Math.hypot(ballPos.x - nearestOpponent.position.x, ballPos.y - nearestOpponent.position.y);
      if (inKickRange && oppDist < 75 && bot.canDribble()) {
        const oppDy = nearestOpponent.position.y - botPos.y;
        wantDribble = oppDy >= 0 ? "left" : "right";
      }
    }

    // --- SPRINT & DASH LOGIC ---
    const wantSprint = distToBall > 160 && bot.stamina > 25;
    const wantDash = isAmIClosestToBall && distToBall > 90 && distToBall < 180 && bot.canDash();

    // Movement direction vector normalized
    let moveX = targetX - botPos.x;
    let moveY = targetY - botPos.y;
    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 0.0001) {
      moveX /= moveLen;
      moveY /= moveLen;
    }

    return {
      moveX,
      moveY,
      kick: wantKick,
      dribbleSide: wantDribble,
      sprint: wantSprint,
      dash: wantDash,
    };
  }
}

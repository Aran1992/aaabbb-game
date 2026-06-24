export interface Point {
  x: number;
  y: number;
}

export class CircleCollider {
  constructor(public x: number, public y: number, public radius: number) {}

  intersectsCircle(other: CircleCollider): boolean {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const distSq = dx * dx + dy * dy;
    const rSum = this.radius + other.radius;
    return distSq <= rSum * rSum;
  }
}

export class RectCollider {
  constructor(
    public x: number, // 矩形中心点 X
    public y: number, // 矩形中心点 Y
    public width: number,
    public height: number
  ) {}

  intersectsCircle(circle: CircleCollider): boolean {
    // 找到矩形上距离圆心最近的点
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const minX = this.x - halfW;
    const maxX = this.x + halfW;
    const minY = this.y - halfH;
    const maxY = this.y + halfH;

    const closestX = Math.max(minX, Math.min(circle.x, maxX));
    const closestY = Math.max(minY, Math.min(circle.y, maxY));

    const dx = circle.x - closestX;
    const dy = circle.y - closestY;
    const distSq = dx * dx + dy * dy;

    return distSq <= circle.radius * circle.radius;
  }
}

export class SectorCollider {
  constructor(
    public x: number, // 扇形顶点 X
    public y: number, // 扇形顶点 Y
    public radius: number, // 扇形半径
    public rotation: number, // 扇形中轴线弧度
    public angle: number // 扇形开角弧度
  ) {}

  intersectsCircle(circle: CircleCollider): boolean {
    const dx = circle.x - this.x;
    const dy = circle.y - this.y;
    const distSq = dx * dx + dy * dy;

    // 1. 判断圆心是否在扇形大圆半径+目标半径范围内
    const maxDist = this.radius + circle.radius;
    if (distSq > maxDist * maxDist) {
      return false;
    }

    // 2. 特殊情况：圆心与扇形顶点太近
    if (distSq < circle.radius * circle.radius) {
      return true;
    }

    // 3. 计算圆心相对于扇形顶点的夹角
    let targetAngle = Math.atan2(dy, dx);
    // 归一化夹角差
    let angleDiff = targetAngle - this.rotation;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    const halfAngle = this.angle / 2;

    // 4. 如果圆心直接落在扇形夹角范围内
    if (Math.abs(angleDiff) <= halfAngle) {
      return distSq <= this.radius * this.radius;
    }

    // 5. 否则，判断圆是否与扇形的两条边相交
    // 扇形两条射线的方向
    const leftAngle = this.rotation - halfAngle;
    const rightAngle = this.rotation + halfAngle;

    return (
      this.checkLineSegmentIntersection(leftAngle, circle) ||
      this.checkLineSegmentIntersection(rightAngle, circle)
    );
  }

  private checkLineSegmentIntersection(lineAngle: number, circle: CircleCollider): boolean {
    // 射线段的起点为 (this.x, this.y)，长度为 this.radius
    const dx = Math.cos(lineAngle);
    const dy = Math.sin(lineAngle);

    // 投影长度
    const cx = circle.x - this.x;
    const cy = circle.y - this.y;
    let t = cx * dx + cy * dy;

    // 限制在射线段范围内 [0, radius]
    t = Math.max(0, Math.min(t, this.radius));

    // 最近点
    const closestX = this.x + dx * t;
    const closestY = this.y + dy * t;

    const distDx = circle.x - closestX;
    const distDy = circle.y - closestY;

    return distDx * distDx + distDy * distDy <= circle.radius * circle.radius;
  }
}

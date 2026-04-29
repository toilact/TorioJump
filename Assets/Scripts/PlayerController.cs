using UnityEngine;

/// <summary>
/// A production-ready 2D Character Controller focusing on the "Super Mario" arcade feel.
/// Uses Rigidbody2D and BoxCast for precise collision and responsive movement.
/// </summary>
[RequireComponent(typeof(Rigidbody2D), typeof(BoxCollider2D))]
public class PlayerController : MonoBehaviour
{
    [Header("Horizontal Movement")]
    [SerializeField, Tooltip("Maximum horizontal speed.")]
    private float maxSpeed = 12f;
    [SerializeField, Tooltip("How fast the character reaches max speed.")]
    private float acceleration = 60f;
    [SerializeField, Tooltip("How fast the character stops when no input is provided.")]
    private float deceleration = 60f;
    [SerializeField, Tooltip("Friction applied when changing direction.")]
    private float friction = 80f;

    [Header("Jump Physics")]
    [SerializeField, Tooltip("Initial upward force of the jump.")]
    private float jumpForce = 16f;
    [SerializeField, Tooltip("Gravity multiplier when the jump button is released early.")]
    private float jumpCutMultiplier = 3f;
    [SerializeField, Tooltip("Standard gravity multiplier when falling.")]
    private float fallGravityMultiplier = 4f;
    [SerializeField, Tooltip("Standard gravity multiplier when jumping up.")]
    private float riseGravityMultiplier = 2f;

    [Header("Jump Apex")]
    [SerializeField, Tooltip("Velocity threshold to consider the player at the peak of their jump.")]
    private float apexThreshold = 2f;
    [SerializeField, Tooltip("Gravity multiplier at the peak of the jump for hang-time.")]
    private float apexGravityMultiplier = 0.5f;
    [SerializeField, Tooltip("Additional horizontal speed boost at the apex.")]
    private float apexBonusSpeed = 2f;

    [Header("Input Forgiveness")]
    [SerializeField, Tooltip("Time window to jump after walking off a ledge.")]
    private float coyoteTime = 0.15f;
    [SerializeField, Tooltip("Time window to buffer a jump input before hitting the ground.")]
    private float jumpBufferTime = 0.15f;

    [Header("Collision Detection")]
    [SerializeField, Tooltip("Layer mask for ground detection.")]
    private LayerMask groundLayer;
    [SerializeField, Tooltip("Size offset for the BoxCast ground check.")]
    private float groundCheckOffset = 0.05f;

    // Internal State
    private Rigidbody2D rb;
    private BoxCollider2D col;
    private Vector2 moveInput;
    
    private bool isGrounded;
    private bool wasGrounded;
    private bool isJumping;
    private bool jumpRequested;
    private bool jumpReleased;
    
    private float coyoteTimeCounter;
    private float jumpBufferCounter;
    private float defaultGravityScale;

    private void Awake()
    {
        rb = GetComponent<Rigidbody2D>();
        col = GetComponent<BoxCollider2D>();
        defaultGravityScale = rb.gravityScale;
    }

    private void Update()
    {
        // Gather Input
        moveInput.x = Input.GetAxisRaw("Horizontal");
        
        if (Input.GetButtonDown("Jump"))
        {
            jumpBufferCounter = jumpBufferTime;
        }

        if (Input.GetButtonUp("Jump"))
        {
            jumpReleased = true;
        }

        // Handle Timers
        if (jumpBufferCounter > 0) jumpBufferCounter -= Time.deltaTime;
        if (coyoteTimeCounter > 0) coyoteTimeCounter -= Time.deltaTime;
    }

    private void FixedUpdate()
    {
        CheckCollisions();
        
        HandleHorizontalMovement();
        HandleJump();
        HandleGravity();
        
        ApplyFinalVelocity();
    }

    private void CheckCollisions()
    {
        wasGrounded = isGrounded;
        
        // Use BoxCast for precise ground detection
        Bounds bounds = col.bounds;
        RaycastHit2D hit = Physics2D.BoxCast(
            bounds.center, 
            new Vector2(bounds.size.x - 0.1f, 0.1f), 
            0f, 
            Vector2.down, 
            bounds.extents.y + groundCheckOffset, 
            groundLayer
        );

        isGrounded = hit.collider != null;

        if (isGrounded)
        {
            coyoteTimeCounter = coyoteTime;
            isJumping = false;
        }
    }

    private void HandleHorizontalMovement()
    {
        float targetSpeed = moveInput.x * maxSpeed;
        
        // Apply Apex Bonus
        if (!isGrounded && Mathf.Abs(rb.velocity.y) < apexThreshold)
        {
            targetSpeed += moveInput.x * apexBonusSpeed;
        }

        float accelRate;

        // Determine if we are accelerating, decelerating, or turning (friction)
        if (Mathf.Abs(targetSpeed) > 0.01f)
        {
            // If we are trying to move in the opposite direction of current velocity, use friction
            bool isTurning = Mathf.Sign(targetSpeed) != Mathf.Sign(rb.velocity.x) && Mathf.Abs(rb.velocity.x) > 0.01f;
            accelRate = isTurning ? friction : acceleration;
        }
        else
        {
            accelRate = deceleration;
        }

        // Calculate the difference between current and target velocity
        float speedDif = targetSpeed - rb.velocity.x;
        float movement = speedDif * accelRate * Time.fixedDeltaTime;

        rb.AddForce(movement * Vector2.right, ForceMode2D.Impulse);
    }

    private void HandleJump()
    {
        // Check for Jump Input + Forgiveness (Coyote Time & Jump Buffer)
        if (jumpBufferCounter > 0 && coyoteTimeCounter > 0 && !isJumping)
        {
            ExecuteJump();
        }
    }

    private void ExecuteJump()
    {
        isJumping = true;
        jumpBufferCounter = 0;
        coyoteTimeCounter = 0;
        jumpReleased = false;

        // Reset vertical velocity for consistent jump height
        rb.velocity = new Vector2(rb.velocity.x, 0);
        rb.AddForce(Vector2.up * jumpForce, ForceMode2D.Impulse);
    }

    private void HandleGravity()
    {
        // Custom gravity logic for "Mario" feel
        if (isGrounded)
        {
            rb.gravityScale = defaultGravityScale;
            return;
        }

        // 1. Apex Hang Time
        if (Mathf.Abs(rb.velocity.y) < apexThreshold)
        {
            rb.gravityScale = defaultGravityScale * apexGravityMultiplier;
        }
        // 2. Rising (Jump Cut Logic)
        else if (rb.velocity.y > 0)
        {
            if (jumpReleased)
            {
                // Released jump button early -> fall faster (variable jump height)
                rb.gravityScale = defaultGravityScale * jumpCutMultiplier;
            }
            else
            {
                rb.gravityScale = defaultGravityScale * riseGravityMultiplier;
            }
        }
        // 3. Falling (Fast Fall)
        else
        {
            rb.gravityScale = defaultGravityScale * fallGravityMultiplier;
        }
    }

    private void ApplyFinalVelocity()
    {
        // Clamp horizontal velocity to maxSpeed (plus potential apex bonus)
        float currentMax = maxSpeed + (Mathf.Abs(rb.velocity.y) < apexThreshold && !isGrounded ? apexBonusSpeed : 0);
        float clampedX = Mathf.Clamp(rb.velocity.x, -currentMax, currentMax);
        
        rb.velocity = new Vector2(clampedX, rb.velocity.y);
    }

    /// <summary>
    /// Call this from an enemy script when the player jumps on its head.
    /// </summary>
    public void BounceOffEnemy()
    {
        isJumping = true;
        jumpReleased = false;
        rb.velocity = new Vector2(rb.velocity.x, 0);
        rb.AddForce(Vector2.up * jumpForce * 0.75f, ForceMode2D.Impulse);
    }

    private void OnDrawGizmosSelected()
    {
        // Visualize the ground check BoxCast in the Editor
        if (col == null) col = GetComponent<BoxCollider2D>();
        if (col == null) return;

        Gizmos.color = isGrounded ? Color.green : Color.red;
        Bounds bounds = col.bounds;
        Vector3 pos = bounds.center + Vector3.down * (bounds.extents.y + groundCheckOffset);
        Gizmos.DrawWireCube(pos, new Vector2(bounds.size.x - 0.1f, 0.1f));
    }
}

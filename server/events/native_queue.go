package events

import (
	"fmt"
	"github.com/jitsucom/jitsu/server/logging"
	"github.com/jitsucom/jitsu/server/metrics"
	"github.com/jitsucom/jitsu/server/queue"
	"github.com/jitsucom/jitsu/server/safego"
	"time"
)

// TimedEventBuilder creates and returns a new *events.TimedEvent (must be pointer).
// This is used on deserialization
func TimedEventBuilder() interface{} {
	return &TimedEvent{}
}

//NativeQueue is a event queue implementation by Jitsu
type NativeQueue struct {
	namespace  string
	identifier string
	queue      queue.Queue

	closed chan struct{}
}

func NewNativeQueue(namespace, identifier string, queue queue.Queue) (Queue, error) {
	metrics.InitialStreamEventsQueueSize(identifier, int(queue.Size()))

	nq := &NativeQueue{
		queue:      queue,
		namespace:  namespace,
		identifier: identifier,
		closed:     make(chan struct{}, 1),
	}

	safego.Run(nq.startMonitor)
	return nq, nil
}

func (q *NativeQueue) startMonitor() {
	debugTicker := time.NewTicker(time.Minute * 10)
	for {
		select {
		case <-q.closed:
			return
		case <-debugTicker.C:
			size := q.queue.Size()
			logging.Infof("[queue: %s_%s] current size: %d", q.namespace, q.identifier, size)
		}
	}
}

func (q *NativeQueue) Consume(f map[string]interface{}, tokenID string) {
	q.ConsumeTimed(f, time.Now().UTC(), tokenID)
}

func (q *NativeQueue) ConsumeTimed(payload map[string]interface{}, t time.Time, tokenID string) {
	te := &TimedEvent{
		Payload:      payload,
		DequeuedTime: t,
		TokenID:      tokenID,
	}

	if err := q.queue.Push(te); err != nil {
		logSkippedEvent(payload, fmt.Errorf("Error putting event event bytes to the queue: %v", err))
		return
	}

	metrics.EnqueuedEvent(q.identifier)
}

func (q *NativeQueue) DequeueBlock() (Event, time.Time, string, error) {
	ite, err := q.queue.Pop()
	if err != nil {
		if err == queue.ErrQueueClosed {
			return nil, time.Time{}, "", ErrQueueClosed
		}

		return nil, time.Time{}, "", err
	}

	metrics.DequeuedEvent(q.identifier)

	te, ok := ite.(*TimedEvent)
	if !ok {
		return nil, time.Time{}, "", fmt.Errorf("wrong type of event dto in queue. Expected: *TimedEvent, actual: %T (%s)", ite, ite)
	}

	return te.Payload, te.DequeuedTime, te.TokenID, nil
}

//Close closes underlying queue
func (q *NativeQueue) Close() error {
	close(q.closed)
	return q.queue.Close()
}
